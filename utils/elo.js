/**
 * Formula References:
 * 1. Expected Score (probability of win):
 *    E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 *
 * 2. New Rating:
 *    R_new = R_old + K × (Actual - Expected)
 *
 * @param {number} playerRating - The player's current ELO rating (e.g., 1600)
 * @param {number} opponentRating - The opponent's current ELO rating (e.g., 1500)
 * @param {number} outcome - The match result: 1 for win, 0.5 for tie, 0 for loss
 * @param {number} [kFactor=32] - The K-factor controlling rating volatility (default: 32)
 *                                 Higher K = more volatile ratings
 *                                 In chess: 8-16 for masters, 16-24 for intermediate, 32 for new
 *
 * @returns {number} The new ELO rating, rounded to the nearest integer
 *
 * @throws {Error} If inputs are invalid (non-numeric, outcome outside [0, 1], negative K)
 *
 * @example
 * // Player rated 1600 beats opponent rated 1500
 * const newRating = calculateNewElo(1600, 1500, 1);
 * // Returns approximately 1602
 *
 * @example
 * // Player rated 1600 loses to opponent rated 1500
 * const newRating = calculateNewElo(1600, 1500, 0);
 * // Returns approximately 1598
 *
 * @example
 * // Player rated 1600 ties opponent rated 1500 (using custom K-factor)
 * const newRating = calculateNewElo(1600, 1500, 0.5, 16);
 * // Returns approximately 1600
 */
export function calculateNewElo(playerRating, opponentRating, outcome, kFactor = 32) {
  // ===== INPUT VALIDATION =====
  // Validate numeric inputs
  if (!Number.isFinite(playerRating)) {
    throw new Error(`Invalid playerRating: ${playerRating}. Must be a finite number.`);
  }
  if (!Number.isFinite(opponentRating)) {
    throw new Error(`Invalid opponentRating: ${opponentRating}. Must be a finite number.`);
  }
  if (!Number.isFinite(outcome)) {
    throw new Error(`Invalid outcome: ${outcome}. Must be a finite number.`);
  }
  if (!Number.isFinite(kFactor)) {
    throw new Error(`Invalid kFactor: ${kFactor}. Must be a finite number.`);
  }

  // Validate outcome range: must be 0, 0.5, or 1
  if (outcome < 0 || outcome > 1) {
    throw new Error(`Invalid outcome: ${outcome}. Must be 0 (loss), 0.5 (tie), or 1 (win).`);
  }

  // Validate K-factor is positive
  if (kFactor <= 0) {
    throw new Error(`Invalid kFactor: ${kFactor}. Must be a positive number.`);
  }

  // ===== ELO CALCULATION =====
  // Step 1: Calculate Expected Score (probability player wins)
  // E_A = 1 / (1 + 10^((R_B - R_A) / 400))
  const ratingDifference = opponentRating - playerRating;
  const expectedScore = 1 / (1 + Math.pow(10, ratingDifference / 400));

  // Step 2: Calculate New Rating
  // R_new = R_old + K × (Actual - Expected)
  const ratingChange = kFactor * (outcome - expectedScore);
  const newRating = playerRating + ratingChange;

  // Step 3: Round to nearest integer
  return Math.round(newRating);
}

/**
 * Calculates ELO changes for BOTH players in a match.
 * Useful for batch updates when tracking both player's new ratings.
 *
 * @param {number} player1Rating - First player's current rating
 * @param {number} player2Rating - Second player's current rating
 * @param {number} outcome - From player1's perspective: 1 = win, 0.5 = tie, 0 = loss
 * @param {number} [kFactor=32] - K-factor for both players
 *
 * @returns {Object} Object with newRating1 and newRating2
 *
 * @example
 * const { newRating1, newRating2 } = calculateBothPlayerElo(1600, 1500, 1);
 * // newRating1 ≈ 1602 (winner)
 * // newRating2 ≈ 1498 (loser)
 */
export function calculateBothPlayerElo(player1Rating, player2Rating, outcome, kFactor = 32) {
  // Player 1's outcome as given
  const newRating1 = calculateNewElo(player1Rating, player2Rating, outcome, kFactor);

  // Player 2's outcome is inverse (if player1 wins, player2 loses)
  const player2Outcome = outcome === 1 ? 0 : outcome === 0 ? 1 : 0.5;
  const newRating2 = calculateNewElo(player2Rating, player1Rating, player2Outcome, kFactor);

  return {
    newRating1,
    newRating2,
  };
}

export default calculateNewElo;
