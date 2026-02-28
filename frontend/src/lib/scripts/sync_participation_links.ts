import PocketBase from 'pocketbase';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// CONFIGURATION
const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASS = process.env.PB_ADMIN_PASS;

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

async function main() {
    const rl = readline.createInterface({ input, output });

    if (!ADMIN_EMAIL || !ADMIN_PASS) {
        console.error('❌ Error: PB_ADMIN_EMAIL and PB_ADMIN_PASS environment variables are required.');
        process.exit(1);
    }

    try {
        console.log("\n--- PRE-FLIGHT CHECK ---");
        const answer = await rl.question('Have you manually created the "student_migrated" relation field in the participations collection? (y/n): ');

        if (answer.toLowerCase() !== 'y') {
            console.log("Aborting. Please create the field first and then run this script again.");
            process.exit(0);
        }

        console.log("🔌 Connecting to PocketBase...");
        await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASS);

        // 1. Fetch records that need migration
        console.log("🔄 Fetching records where 'student_migrated' is empty...");
        const records = await pb.collection('participations').getFullList({
            filter: 'student_migrated = ""',
            // Ensure we grab the current 'student' ID
            fields: 'id,student'
        });

        if (records.length === 0) {
            console.log("ℹ️ No records found that need migration.");
        } else {
            console.log(`Found ${records.length} records to migrate.`);

            // 2. Batch Update
            const batchSize = 50;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                console.log(`   Processing batch ${i + 1}-${Math.min(i + batchSize, records.length)}...`);

                await Promise.all(batch.map(r => {
                    return pb.collection('participations').update(r.id, {
                        student_migrated: r.student
                    });
                }));
            }
            console.log("✅ Data migration complete.");
        }

        // 3. Final Instructions
        console.log("\n" + "=".repeat(50));
        console.log("🎉 SUCCESS: Data has been copied.");
        console.log("=".repeat(50));
        console.log("FINAL MANUAL STEPS IN POCKETBASE UI:");
        console.log("1. Go to 'participations' collection settings.");
        console.log("2. Rename the old 'student' field to 'old_students'.");
        console.log("3. Rename your new 'student_migrated' field to 'student'.");
        console.log("4. (Optional) Once verified, you can delete the 'old_students' field.");
        console.log("=".repeat(50) + "\n");

    } catch (err: any) {
        console.error("❌ Error:", err.message);
    } finally {
        rl.close();
    }
}

main();
