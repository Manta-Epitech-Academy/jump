import PocketBase from 'pocketbase';
import type { OldStudentsResponse } from '../pocketbase-types';

// CONFIGURATION
const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASS = process.env.PB_ADMIN_PASS;

const pb = new PocketBase(PB_URL);

// Disable auto-cancellation to allow batch processing
pb.autoCancellation(false);

async function main() {
    if (!ADMIN_EMAIL || !ADMIN_PASS) {
        console.error('❌ Error: PB_ADMIN_EMAIL and PB_ADMIN_PASS environment variables are required.');
        process.exit(1);
    }

    try {
        console.log('🔌 Connecting to PocketBase...');
        await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASS);
        console.log('✅ Authenticated as Admin');

        // 1. Fetch all OLD students
        console.log('📥 Fetching records from "old_students"...');
        const oldStudents = await pb.collection('old_students').getFullList<OldStudentsResponse>();
        console.log(`found ${oldStudents.length} records to migrate.`);

        let successCount = 0;
        let errorCount = 0;

        // 2. Iterate and Migrate
        for (const old of oldStudents) {
            try {
                // Check if already exists in new collection (idempotency)
                try {
                    await pb.collection('students').getOne(old.id);
                    console.log(`Example: Student ${old.id} already migrated. Skipping.`);
                    continue;
                } catch (e) {
                    // Record not found, proceed with creation
                }

                const email = old.old_email

                // Random password (they will use OTP anyway)
                const tempPassword = crypto.randomUUID() + Math.random().toString(36);

                const newPayload = {
                    // CRITICAL: Preserve the ID to keep relations intact
                    id: old.id,

                    // Auth Fields
                    email: email,
                    emailVisibility: true,
                    password: tempPassword,
                    passwordConfirm: tempPassword,
                    verified: true, // Auto-verify migrated users

                    // Copied Fields
                    campus: old.campus,
                    nom: old.nom,
                    prenom: old.prenom,
                    phone: old.phone,
                    parent_email: old.parent_email,
                    parent_phone: old.parent_phone,
                    niveau: old.niveau,
                    niveau_difficulte: old.niveau_difficulte,
                    xp: old.xp,
                    events_count: old.events_count,

                    // New Fields Defaults
                    level: 'Novice',
                    badges: []
                };

                await pb.collection('students').create(newPayload, { requestKey: null });
                console.log(`✅ Migrated: ${old.prenom} ${old.nom} (${old.id})`);
                successCount++;

            } catch (err: any) {
                console.error(`❌ Failed to migrate ${old.id} (${old.prenom} ${old.nom}):`, err?.data || err.message);
                errorCount++;
            }
        }

        console.log('\n--- Migration Summary ---');
        console.log(`✅ Successfully migrated: ${successCount}`);
        console.log(`❌ Failed: ${errorCount}`);

    } catch (err) {
        console.error('Fatal Error:', err);
    }
}

main();
