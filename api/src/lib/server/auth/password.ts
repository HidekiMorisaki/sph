const MINIMUM_PASSWORD_LENGTH = 12;

export function isStrongPassword(password: string): boolean {
	return (
		password.length >= MINIMUM_PASSWORD_LENGTH &&
		/[a-z]/.test(password) &&
		/[A-Z]/.test(password) &&
		/\d/.test(password)
	);
}
