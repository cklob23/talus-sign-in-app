/**
 * Lookups for still-valid safety training. Shared by kiosk, QR, and training
 * links. Implementation lives in training-clearance.ts so one check cannot
 * drift between flows.
 */

export {
  getTrainingClearance,
  hasValidTrainingForEmail,
  hasValidTrainingForVisitor,
  isUnexpiredCompletion,
} from "@/lib/training-clearance"
