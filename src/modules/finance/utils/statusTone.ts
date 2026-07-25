// Finance re-exports the platform-wide canonical helper. Kept so existing finance imports
// (`@/modules/finance/utils/statusTone`) don't churn. New code should import `@/utils/statusTone`.
export { statusTone, directionTone } from '@/utils/statusTone';
