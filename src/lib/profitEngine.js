/**
 * profitEngine.js
 * ---------------
 * Core scoring logic for LoadProfit.
 *
 * The single most controllable loss for a small carrier is the empty
 * (deadhead) mile. A load that pays $2.50/mi gross can easily be the
 * worst choice on the board once you factor in:
 *   1. The empty miles to get to the pickup (deadhead IN)
 *   2. The empty miles likely after delivery, based on how "exitable"
 *      the destination market is (deadhead OUT)
 *
 * scoreLoad() returns NET profit and NET $/mile across ALL miles the
 * truck will roll for this load — not just the loaded miles the broker
 * pays for.
 */

// Earth's radius in miles — used by the haversine great-circle formula.
const EARTH_RADIUS_MI = 3958.8;

/**
 * Great-circle distance between two lat/lng points, in miles.
 * Good enough for load-board deadhead estimates (within ~1-2%).
 */
export function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MI * c;
}

/**
 * Score a single load from the truck's current position.
 *
 * @param {object} load     - Load row (origin/dest lat-lng, miles, rate, dest_exit_score, ...)
 * @param {number} currentLat
 * @param {number} currentLng
 * @param {object} costs    - { mpg, fuelPrice, driverPay, insurance, maintenance }
 *                            All per-mile except fuelPrice ($/gal) and mpg.
 * @returns {object} Full breakdown so the UI can show WHY a load ranks where it does.
 */
export function scoreLoad(load, currentLat, currentLng, costs) {
  // 1. Empty miles to get to pickup.
  const deadheadIn = haversine(
    currentLat,
    currentLng,
    load.origin_lat,
    load.origin_lng,
  );

  // 2. Paid miles on the load itself.
  const loadedMiles = load.miles;

  // 3. Expected empty miles AFTER delivery.
  //    dest_exit_score is 0..1 — higher means it's easy to find a
  //    reload out of that market. A "dead" market (score = 0) costs
  //    you a full 250mi reposition; a hot market (score = 1) costs 0.
  const deadheadOut = 250 * (1 - load.dest_exit_score);

  // 4. Every mile the truck actually rolls for this opportunity.
  const totalMiles = deadheadIn + loadedMiles + deadheadOut;

  // 5. Fuel: gallons burned × price per gallon.
  const fuelCost = (totalMiles / costs.mpg) * costs.fuelPrice;

  // 6. All other variable costs scale per mile (loaded OR empty).
  const variableCost =
    (costs.driverPay + costs.insurance + costs.maintenance) * totalMiles;

  // 7. Net profit = gross rate - fuel - other variable costs.
  //    Note: the broker only pays for loadedMiles, but YOU pay for all
  //    totalMiles. That's the whole reason gross $/mi lies.
  const netProfit = load.rate - fuelCost - variableCost;

  // 8. Net $/mile across every mile the truck rolls.
  //    This is the apples-to-apples number for ranking loads.
  const netPerMile = totalMiles > 0 ? netProfit / totalMiles : 0;

  return {
    deadheadIn,
    loadedMiles,
    deadheadOut,
    totalMiles,
    fuelCost,
    variableCost,
    netProfit,
    netPerMile,
    // Convenience for the UI: gross $/mi the broker quotes (loaded only).
    grossPerMile: loadedMiles > 0 ? load.rate / loadedMiles : 0,
    // What % of the truck's rolling miles are empty for this load.
    deadheadPct: totalMiles > 0 ? (deadheadIn + deadheadOut) / totalMiles : 0,
  };
}
