// TODO: Add shared test users here once authentication is in place.
// These fixtures are imported by E2E tests that need pre-existing users.
// Auth: staff via Microsoft OAuth, students/parents via email OTP — no passwords.

export const testUsers = {
  staff: {
    email: process.env.TEST_STAFF_EMAIL ?? 'staff@epitech.eu',
  },
  student: {
    email: process.env.TEST_STUDENT_EMAIL ?? 'student@test.fr',
  },
};
