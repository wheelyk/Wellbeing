# WellTrack --- Requirements

## 1. Overview

WellTrack is a wellness tracking web application for people living with
chronic health conditions.

The application allows users to record symptoms, mood, medications, and
daily habits, then review historical trends to identify patterns over
time.

The product should feel like a simple health journal with basic
analytics. The MVP must be quick and easy to use, particularly for users
who may experience brain fog, fatigue, or reduced concentration.

This document defines the MVP requirements based on the supplied product
brief, data model, API outline, and UI wireframes.

------------------------------------------------------------------------

## 2. Goals

### Primary goals

-   Make daily health logging fast and low effort.
-   Allow users to consistently record symptoms, mood, medications, and
    habits.
-   Provide a clear history of previous entries.
-   Surface simple trends over 7, 30, and 90 day periods.
-   Give users control over their personal data.
-   Provide a clean, calm, accessible interface suitable for frequent
    use.

### Non-goals for the MVP

The MVP will not:

-   Provide medical diagnosis.
-   Replace professional medical advice.
-   Automatically recommend medication changes.
-   Attempt to establish medically validated causal relationships
    between symptoms and behaviours.
-   Include complex clinical analytics.
-   Integrate with wearable devices unless added as a future feature.

------------------------------------------------------------------------

## 3. Target users

The primary user is someone managing a chronic health condition who
wants to maintain a personal record of:

-   Symptoms
-   Mood
-   Energy
-   Stress
-   Medication adherence
-   Daily habits and activities

The interface should minimise cognitive load and avoid requiring long
forms or complicated navigation.

------------------------------------------------------------------------

## 4. Technology Stack

The initial implementation should use:

-   **Frontend:** React + TypeScript
-   **Styling:** Tailwind CSS
-   **Backend:** Node.js + Express
-   **Database:** PostgreSQL
-   **ORM:** Prisma
-   **Authentication:** JWT access tokens with refresh tokens
-   **Hosting:** To be determined; candidate platforms include Vercel,
    Railway, or Render.

The application should be structured so that the frontend and backend
remain independently testable and deployable.

------------------------------------------------------------------------

# 5. Functional Requirements

## 5.1 Authentication

Users must be able to:

-   Register using email and password.
-   Log in.
-   Log out.
-   Refresh an expired access token using a refresh token.
-   Request a password reset by email.
-   Complete a password reset.
-   View their profile.
-   Edit their display name.
-   Edit their timezone.
-   Delete their account.

### Account deletion

Account deletion must remove the user's personal data and associated log
entries.

The implementation must ensure that deleting a user cannot leave
accessible personal health records belonging to that user.

------------------------------------------------------------------------

## 5.2 User Profile

A user profile must contain:

-   Unique user ID.
-   Unique email address.
-   Password hash.
-   Display name.
-   Timezone.
-   Account creation timestamp.

The application must never store a user's plain-text password.

------------------------------------------------------------------------

# 6. Daily Logging

Users must be able to create, edit, and delete daily log entries.

Logging should support the following categories:

1.  Symptoms
2.  Mood
3.  Medications
4.  Habits

The date should default to today but users must be able to backfill
entries for previous dates.

------------------------------------------------------------------------

## 6.1 Symptoms

Users must be able to:

-   Select a symptom.
-   Record symptom severity from 1--10.
-   Add optional notes.
-   Specify the date/time of the entry.
-   Edit an existing symptom entry.
-   Delete an existing symptom entry.

Symptoms may be system-defined or user-specific.

The data model should allow a symptom to be associated with a specific
user while also supporting system/default symptoms.

------------------------------------------------------------------------

## 6.2 Mood

Users must be able to record mood using a simple 1--5 scale.

The UI should use large, easy-to-select visual controls, such as the
illustrated emoji scale:

-   1 --- Bad
-   2
-   3 --- Neutral
-   4
-   5 --- Great

Users may optionally record:

-   Energy level from 1--7.
-   Stress level from 1--7.
-   Notes.

The mood entry must support:

-   Date/time.
-   Editing.
-   Deletion.
-   Backfilling previous dates.

------------------------------------------------------------------------

## 6.3 Medications

Users must be able to record whether a medication was taken.

The application should support:

-   Medication name.
-   Taken/not taken status.
-   Date/time.
-   Optional notes where appropriate.
-   Editing an entry.
-   Deleting an entry.
-   Backfilling previous dates.

The dashboard should provide a simple summary such as:

> Medications: 1/2 taken

------------------------------------------------------------------------

## 6.4 Habits

Users must be able to log daily habits.

A habit may be represented by:

-   Yes/no completion.
-   A numeric value.
-   A duration.

The exact input control should depend on the configured habit type.

Examples could include:

-   Exercise completed.
-   Walking duration.
-   Water intake.
-   Sleep duration.
-   Other user-defined habits.

Habits must support editing, deletion, and historical backfilling.

------------------------------------------------------------------------

# 7. Dashboard / Home Screen

The dashboard is the primary screen shown after login.

It should display:

### Today's date

Show the current date using the user's configured timezone.

### Today's summary

Show a concise summary of what has been logged today, for example:

-   Mood: 4/5
-   Symptoms: 2 logged
-   Medications: 1/2 taken

### Quick Add

Provide prominent buttons for:

-   `+ Symptom`
-   `+ Mood`
-   `+ Medication`
-   `+ Habit`

Quick Add controls should minimise the number of taps required to create
a new entry.

### Logging consistency

Show a simple indicator such as:

-   Current logging streak.
-   Number of days logged this week.

The indicator should be informational rather than gamified or
pressuring.

### Recent entries

Show the most recent entries, for example:

-   Headache --- 6/10 --- 2:30 PM
-   Mood --- 4/5 --- 9:00 AM
-   Lisinopril --- Taken --- 8:15 AM

------------------------------------------------------------------------

# 8. Log Entry UI

The log-entry experience should use either a modal or a dedicated page.

The design should prioritise large controls and minimal cognitive
effort.

### Requirements

-   Clearly identify what is being logged.
-   Provide large tap-friendly rating controls.
-   Provide optional notes.
-   Provide a date picker.
-   Default the date to today.
-   Allow historical entries.
-   Provide a clear Save button.
-   Provide a Cancel action.
-   Validate required fields before saving.

For mood, the interface should resemble the supplied wireframe, with:

-   Five visual mood choices.
-   Optional energy rating.
-   Optional stress rating.
-   Optional notes.
-   `Save Entry` button.

------------------------------------------------------------------------

# 9. History

The application should provide a history view showing previous entries.

Users should be able to:

-   Browse previous entries.
-   Filter or group entries by date.
-   See entry type.
-   See recorded values.
-   Edit entries.
-   Delete entries.

History should make it straightforward to locate an entry from a
previous day.

------------------------------------------------------------------------

# 10. Trends / Analytics

The Trends screen should provide simple visual analytics.

Users should be able to select:

-   7 days
-   30 days
-   90 days

The application should display trends for:

### Symptom severity

Show symptom severity over time and calculate a simple average for the
selected period.

Example:

> Symptom Severity --- Avg: 5.2

### Mood

Show mood over time using a simple line chart and provide an average for
the selected period.

Example:

> Mood --- Avg: 3.4

### Activity / habits

Provide a simple calendar-style activity view showing days on which
relevant activity or logging occurred.

The analytics must be descriptive rather than diagnostic.

The application should avoid claiming that one factor causes another
unless a future feature explicitly introduces a validated analytical
methodology.

------------------------------------------------------------------------

# 11. Data Model

## 11.1 User

Fields:

-   `id` --- UUID, primary key
-   `email` --- unique
-   `password_hash`
-   `display_name`
-   `timezone` --- default `UTC`
-   `created_at`

------------------------------------------------------------------------

## 11.2 Symptom

Fields should include:

-   `id` --- UUID
-   `user_id` --- nullable; null indicates a system/default symptom
-   `name`
-   `description` --- optional
-   `created_at`

A nullable `user_id` allows the system to provide predefined symptoms
while also allowing user-specific symptoms.

------------------------------------------------------------------------

## 11.3 Symptom Log

Fields should include:

-   `id` --- UUID
-   `user_id`
-   `symptom_id`
-   `severity` --- integer 1--10
-   `notes` --- optional
-   `logged_at`

Relationships:

-   User → many symptom logs
-   Symptom → many symptom logs

------------------------------------------------------------------------

## 11.4 Mood Log

Fields should include:

-   `id` --- UUID
-   `user_id`
-   `mood` --- integer 1--5
-   `energy` --- nullable integer 1--5
-   `stress` --- nullable integer 1--5
-   `notes` --- optional
-   `logged_at`

------------------------------------------------------------------------

## 11.5 Medication

Fields should include:

-   `id` --- UUID
-   `user_id`
-   `name`
-   `created_at`

------------------------------------------------------------------------

## 11.6 Medication Log

Fields should include:

-   `id` --- UUID
-   `user_id`
-   `medication_id`
-   `taken` --- boolean
-   `notes` --- optional
-   `logged_at`

------------------------------------------------------------------------

## 11.7 Habit

Fields should include:

-   `id` --- UUID
-   `user_id`
-   `name`
-   `type`
-   `created_at`

Supported habit types should include at least:

-   Boolean
-   Numeric
-   Duration

------------------------------------------------------------------------

## 11.8 Habit Log

Fields should include:

-   `id` --- UUID
-   `user_id`
-   `habit_id`
-   `value` appropriate to the habit type
-   `notes` --- optional
-   `logged_at`

The database design should preserve the user's timezone when determining
which calendar day an entry belongs to.

------------------------------------------------------------------------

# 12. API Endpoints

All authenticated endpoints must require a valid access token.

## 12.1 Authentication

``` text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

## 12.2 User

``` text
GET    /api/users/me
PATCH  /api/users/me
DELETE /api/users/me
```

## 12.3 Symptoms

Suggested endpoints:

``` text
GET    /api/symptoms
POST   /api/symptoms
PATCH  /api/symptoms/:id
DELETE /api/symptoms/:id

GET    /api/symptom-logs
POST   /api/symptom-logs
PATCH  /api/symptom-logs/:id
DELETE /api/symptom-logs/:id
```

## 12.4 Mood

``` text
GET    /api/mood-logs
POST   /api/mood-logs
PATCH  /api/mood-logs/:id
DELETE /api/mood-logs/:id
```

## 12.5 Medications

``` text
GET    /api/medications
POST   /api/medications
PATCH  /api/medications/:id
DELETE /api/medications/:id

GET    /api/medication-logs
POST   /api/medication-logs
PATCH  /api/medication-logs/:id
DELETE /api/medication-logs/:id
```

## 12.6 Habits

``` text
GET    /api/habits
POST   /api/habits
PATCH  /api/habits/:id
DELETE /api/habits/:id

GET    /api/habit-logs
POST   /api/habit-logs
PATCH  /api/habit-logs/:id
DELETE /api/habit-logs/:id
```

## 12.7 Dashboard

A dashboard endpoint should provide the data required by the Home screen
without requiring the frontend to make many separate requests.

Suggested endpoint:

``` text
GET /api/dashboard?date=YYYY-MM-DD
```

The response should include:

-   Date.
-   Today's mood.
-   Today's symptom count.
-   Today's medication summary.
-   Today's habit summary.
-   Recent entries.
-   Logging streak / days logged this week.

## 12.8 Trends

Suggested endpoint:

``` text
GET /api/trends?period=7d
GET /api/trends?period=30d
GET /api/trends?period=90d
```

The API should return aggregated data suitable for rendering the
supplied trend charts.

------------------------------------------------------------------------

# 13. Security Requirements

Because the application stores sensitive personal health information,
security is a core MVP requirement.

The application must:

-   Hash passwords using a strong password-hashing algorithm.
-   Never store plain-text passwords.
-   Protect authenticated API endpoints.
-   Validate that users can only access their own health data.
-   Prevent one user from accessing another user's logs by changing an
    ID in a request.
-   Use secure refresh-token handling.
-   Apply appropriate CORS configuration.
-   Validate and sanitise API input.
-   Apply rate limiting to authentication endpoints.
-   Avoid logging sensitive health information.
-   Use HTTPS in production.
-   Support account deletion and deletion of associated personal data.

The application should use secure HTTP-only cookies for refresh tokens
where appropriate.

------------------------------------------------------------------------

# 14. Privacy Requirements

Health information should be treated as highly sensitive personal data.

The application should:

-   Collect only information required by the MVP.
-   Clearly explain what data is stored.
-   Allow users to delete their account and associated data.
-   Avoid using personal health data for advertising.
-   Avoid sending personal health information to third-party analytics
    services unless explicitly required and appropriately disclosed.
-   Provide appropriate privacy documentation before production launch.

Any future AI functionality must be designed with privacy and data
minimisation in mind.

------------------------------------------------------------------------

# 15. Accessibility and UX

The interface must be usable by people experiencing fatigue, brain fog,
or reduced concentration.

Requirements include:

-   Large, clearly labelled controls.
-   High-quality keyboard accessibility.
-   Visible focus states.
-   Sufficient colour contrast.
-   Clear error messages.
-   Avoid relying on colour alone to communicate meaning.
-   Simple navigation.
-   Minimal unnecessary animations.
-   Consistent placement of controls.
-   Short forms wherever possible.
-   Confirmation for destructive actions such as account deletion.

The primary logging workflow should require as few interactions as
reasonably possible.

------------------------------------------------------------------------

# 16. Responsive Design

The application must work on:

-   Mobile phones.
-   Tablets.
-   Desktop browsers.

The supplied wireframes primarily represent a mobile-first design.

The desktop experience should retain the same simple workflow rather
than introducing unnecessary complexity.

------------------------------------------------------------------------

# 17. Validation

Frontend and backend validation must both be implemented.

Examples:

-   Symptom severity must be between 1 and 10.
-   Mood must be between 1 and 5.
-   Energy must be between 1 and 5 when provided.
-   Stress must be between 1 and 5 when provided.
-   Required IDs must reference records belonging to the authenticated
    user.
-   Dates must be valid.
-   Email addresses must be validated.
-   Passwords must satisfy defined security requirements.

------------------------------------------------------------------------

# 18. Error Handling

The API should return consistent error responses.

The frontend should:

-   Display useful user-friendly error messages.
-   Avoid exposing internal stack traces.
-   Handle expired access tokens by attempting refresh where
    appropriate.
-   Redirect to login when authentication can no longer be renewed.
-   Provide clear feedback when an entry is successfully saved.

------------------------------------------------------------------------

# 19. Testing Requirements

The implementation should include automated tests for:

### Backend

-   Registration.
-   Login.
-   Token refresh.
-   Password reset.
-   Authentication failures.
-   Authorisation.
-   User isolation.
-   CRUD operations for symptoms.
-   CRUD operations for mood.
-   CRUD operations for medications.
-   CRUD operations for habits.
-   Dashboard calculations.
-   Trend calculations.
-   Validation.

### Frontend

-   Registration and login flows.
-   Dashboard rendering.
-   Quick Add flows.
-   Log-entry validation.
-   Editing and deleting entries.
-   History.
-   Trends.
-   Authentication state.

Critical workflows should have end-to-end coverage.

------------------------------------------------------------------------

# 20. Definition of Done --- MVP

The MVP is complete when:

-   A user can register and log in.
-   A user can securely log out.
-   A user can reset their password.
-   A user can edit their profile.
-   A user can delete their account and personal data.
-   A user can create symptom logs.
-   A user can create mood logs.
-   A user can record medication adherence.
-   A user can record habits.
-   All log types can be edited and deleted.
-   Historical dates can be logged.
-   The Home screen shows today's summary.
-   Quick Add buttons work for all four log types.
-   Recent entries are displayed.
-   Logging streak / weekly logging information is displayed.
-   History can be browsed.
-   Trends can be viewed for 7, 30, and 90 days.
-   Trend calculations are correct.
-   Users cannot access another user's data.
-   Passwords and authentication tokens are handled securely.
-   The application is responsive on mobile and desktop.
-   The core workflows have automated test coverage.
-   The application can be deployed to the chosen hosting platform.

------------------------------------------------------------------------

# 21. Future Enhancements

Potential post-MVP features include:

-   Custom symptom categories.
-   More sophisticated habit tracking.
-   Wearable integrations.
-   Import/export of health journal data.
-   CSV/PDF reports for healthcare appointments.
-   Reminders and notifications.
-   Calendar integrations.
-   More advanced correlation analysis.
-   AI-assisted journal summaries.
-   AI-generated questions for discussion with healthcare professionals.
-   Sharing selected reports with clinicians.
-   Multiple profiles / carers.
-   Offline-first mobile support.

Any AI feature must be clearly positioned as informational and must not
present itself as a medical diagnostic system.

------------------------------------------------------------------------

# 22. Product Design Reference

The supplied wireframes establish the intended visual direction:

-   Calm, uncluttered interface.
-   Mobile-first layout.
-   Dashboard with today's summary.
-   Prominent Quick Add controls.
-   Simple modal/page for logging.
-   Large rating controls.
-   Trends screen with simple charts.
-   Bottom navigation containing:
    -   Home
    -   History
    -   Trends
    -   Settings

The implementation should use these wireframes as UX guidance while
keeping the underlying architecture maintainable and testable.
