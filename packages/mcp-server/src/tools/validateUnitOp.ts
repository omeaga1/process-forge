/**
 * validate_unit_op: the engine's verdict on a proposed unit operation.
 *
 * The implementation lives in @process-forge/protocol (unitop/review.ts) so the
 * in-app unit-op author applies exactly the same three gates -- schema, static
 * analysis, physics -- and hands the model exactly the same feedback.
 */
export {
  executeValidateUnitOp,
  type ValidateUnitOpParams,
  type ValidateUnitOpResult
} from '@process-forge/protocol';
