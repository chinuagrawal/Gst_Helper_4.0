export function authErrorMessage(error) {
  const messages = {
    'auth/invalid-verification-code': 'Incorrect OTP. Check the six-digit code and try again.',
    'auth/code-expired': 'The OTP expired. Send a new code.',
    'auth/too-many-requests': 'Too many attempts. Wait before requesting another OTP.',
    'auth/unauthorized-domain': 'Authorize this website hostname in Firebase Authentication settings.',
    'auth/operation-not-allowed': 'Firebase blocked phone SMS. Check that Phone sign-in is enabled and Authentication → Settings → SMS region policy allows the phone number’s country (India for +91). Also check project billing. [auth/operation-not-allowed]',
    'auth/quota-exceeded': 'The project SMS quota has been exceeded. Check Firebase usage and billing.',
    'auth/billing-not-enabled': 'Enable billing for this Firebase project to send real SMS codes.',
    'auth/invalid-phone-number': 'Enter a valid phone number with its country code.',
    'auth/captcha-check-failed': 'Phone verification failed. Refresh and retry; check that this domain is authorized and verification scripts are not blocked.',
    'auth/network-request-failed': 'Unable to reach Firebase. Check your connection and retry.',
    'auth/invalid-app-credential': 'Firebase could not verify this app. Check the project configuration and authorized domain, then refresh and retry.',
  };
  return messages[error.code] || `Login failed (${error.code || 'network error'}). Please try again.`;
}
