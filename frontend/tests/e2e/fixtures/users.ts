// TODO: Add shared test users here once authentication is in place.
// These fixtures are imported by E2E tests that need pre-existing users.

export const testUsers = {
  staff: {
    email: process.env.TEST_STAFF_EMAIL ?? 'staff@epitech.eu',
    password: process.env.TEST_STAFF_PASSWORD ?? '',
  },
  student: {
    email: process.env.TEST_STUDENT_EMAIL ?? 'student@test.fr',
    password: process.env.TEST_STUDENT_PASSWORD ?? '',
  },
}
