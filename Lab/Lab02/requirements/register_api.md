# Registration API

Build an API that lets someone create an account using a username, email address, password, password confirmation, and an optional date of birth.

Validate the submitted information using sensible conventions for a modern registration service. Reject malformed or unusable details, prevent duplicate accounts, and normalize identity values where appropriate.

A rejected attempt must not create or reserve an account. A successful registration returns the user's public account details and a new session token without exposing passwords or other sensitive information.
