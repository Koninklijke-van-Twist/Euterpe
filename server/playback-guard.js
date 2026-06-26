/** Voorkomt dat onTrackFinished tijdens handmatige wachtrij-acties de queue opnieuw verwerkt. */
let manualQueueOp = 0;

export function enterManualQueueOp() {
  manualQueueOp += 1;
}

export function exitManualQueueOp() {
  manualQueueOp = Math.max(0, manualQueueOp - 1);
}

export function isManualQueueOp() {
  return manualQueueOp > 0;
}

export function _resetManualQueueOpForTests() {
  manualQueueOp = 0;
}
