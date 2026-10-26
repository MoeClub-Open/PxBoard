package plugin

type LoginGrant struct {
	Ticket    string `json:"ticket"`
	ExpiresAt string `json:"expiresAt"`
}

// CreateLoginGrant exchanges an external identity verified by an authorized
// plugin for a short-lived browser-bound login ticket. The browser completes
// authentication through the core, which also enforces account state and MFA.
func (c *Client) CreateLoginGrant(userID, proofDigest, redirectPath string) (LoginGrant, error) {
	var out LoginGrant
	err := c.Request("POST", "/api/v1/runtime/auth/grants", Record{"userId": userID, "proofDigest": proofDigest, "redirectPath": redirectPath}, &out)
	return out, err
}

// VerifyUserCredential confirms that a user can still sign in with their
// password and, when enabled, their current MFA code.
func (c *Client) VerifyUserCredential(userID, password, code string) error {
	return c.Request("POST", "/api/v1/runtime/auth/verify", Record{"userId": userID, "password": password, "code": code}, nil)
}
