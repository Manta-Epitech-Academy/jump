import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

async function main() {
  try {
    // 1. Auth as Admin
    await pb
      .collection('_superusers')
      .authWithPassword(
        process.env.PB_ADMIN_EMAIL!,
        process.env.PB_ADMIN_PASS!,
      );

    // 2. Get all students (getFullList handles pagination automatically)
    const students = await pb.collection('students').getFullList();

    console.log(`Updating ${students.length} students...`);

    // 3. Update each record
    for (const student of students) {
      await pb.collection('students').update(student.id, {
        niveau_difficulte: 'Débutant',
      });
      console.log(`✅ Updated: ${student.id}`);
    }

    console.log('Finished successfully.');
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
