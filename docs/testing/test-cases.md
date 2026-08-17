# Stage 2 test cases

**Status:** Initial draft for Tester review

| ID | Area | Scenario | Expected result | Status |
|---|---|---|---|---|
| S2-01 | Homepage | Guest opens the homepage | Approved campaigns appear without login | Not run |
| S2-02 | Homepage | No campaigns are available | A clear empty-state message appears | Not run |
| S2-03 | Homepage | Campaign request fails | An error appears without crashing the application | Not run |
| S2-04 | Registration | Required fields are empty | Submission is blocked and field errors appear | Not run |
| S2-05 | Registration | Email format is invalid | An email validation message appears | Not run |
| S2-06 | Registration | Password confirmation does not match | Submission is blocked | Not run |
| S2-07 | Registration | Email is already registered | A duplicate-email error appears | Not run |
| S2-08 | Registration | Valid registration is submitted | The account is created successfully | Not run |
| S2-09 | Login | Incorrect credentials are submitted | An error appears and the user remains logged out | Not run |
| S2-10 | Login | Correct credentials are submitted | The user becomes authenticated | Not run |
| S2-11 | Logout | A logged-in user selects Logout | The session clears and logged-out navigation appears | Not run |
| S2-12 | Accessibility | A form is used with the keyboard only | All controls are reachable with visible focus | Not run |
| S2-13 | Responsive | The homepage opens at mobile width | Content remains readable and usable | Not run |
| S2-14 | Integration | The frontend calls an agreed backend endpoint | The response is handled according to the API contract | Not run |

The Testers can expand, replace or reorganise these cases as part of their allocated work.
