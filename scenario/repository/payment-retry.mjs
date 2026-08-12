export function shouldRetryPayment({ status, attempts }) {
  if (attempts >= 3) return false;
  return status >= 400;
}
