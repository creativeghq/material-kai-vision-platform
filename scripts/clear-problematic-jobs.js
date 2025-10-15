import fetch from 'node-fetch';

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function clearProblematicJobs() {
    console.log('🧹 Clearing Problematic Jobs from MIVAA');
    console.log('==================================================');
    
    try {
        // Step 1: Check current job list status
        console.log('\n📊 Step 1: Checking current job list status...');
        const listResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs`);
        console.log(`   Status: ${listResponse.status} ${listResponse.statusText}`);
        
        if (listResponse.status === 500) {
            const errorData = await listResponse.json();
            if (errorData.type === 'serialization_error') {
                console.log('   ❌ Serialization error detected - proceeding with cleanup');
            } else {
                console.log('   ❌ Different error type:', errorData);
            }
        } else if (listResponse.status === 200) {
            const data = await listResponse.json();
            console.log(`   ✅ Job list working - ${data.total_count} jobs found`);
            console.log('   💡 No cleanup needed, but will run anyway for testing');
        }
        
        // Step 2: Call clear problematic jobs endpoint
        console.log('\n🧹 Step 2: Calling clear problematic jobs endpoint...');
        const clearResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/clear-problematic`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`   Status: ${clearResponse.status} ${clearResponse.statusText}`);
        
        if (clearResponse.ok) {
            const clearData = await clearResponse.json();
            console.log('   ✅ Clear operation completed');
            console.log(`   📊 Results:`);
            console.log(`      - Original job count: ${clearData.data.original_job_count}`);
            console.log(`      - Cleared jobs: ${clearData.data.cleared_count}`);
            console.log(`      - Remaining jobs: ${clearData.data.remaining_count}`);
            
            if (clearData.data.cleared_jobs.length > 0) {
                console.log(`      - Cleared job IDs: ${clearData.data.cleared_jobs.join(', ')}`);
            }
        } else {
            const errorData = await clearResponse.text();
            console.log('   ❌ Clear operation failed:', errorData);
            return;
        }
        
        // Step 3: Test job list again
        console.log('\n✅ Step 3: Testing job list after cleanup...');
        const testResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs`);
        console.log(`   Status: ${testResponse.status} ${testResponse.statusText}`);
        
        if (testResponse.ok) {
            const testData = await testResponse.json();
            console.log('   ✅ Job list working after cleanup!');
            console.log(`   📊 Current jobs: ${testData.total_count}`);
            console.log(`   📈 Status counts:`, testData.data?.status_counts || 'N/A');
        } else {
            const errorData = await testResponse.text();
            console.log('   ❌ Job list still failing:', errorData);
        }
        
        // Step 4: Test job statistics
        console.log('\n📈 Step 4: Testing job statistics endpoint...');
        const statsResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/statistics`);
        console.log(`   Status: ${statsResponse.status} ${statsResponse.statusText}`);
        
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            console.log('   ✅ Job statistics working!');
            console.log(`   📊 Total jobs: ${statsData.data.total_jobs}`);
            console.log(`   📊 Active jobs: ${statsData.data.active_jobs}`);
        } else {
            const errorData = await statsResponse.text();
            console.log('   ❌ Job statistics failed:', errorData);
        }
        
        console.log('\n🎉 Cleanup operation completed!');
        console.log('==================================================');
        
    } catch (error) {
        console.error('❌ Error during cleanup operation:', error.message);
    }
}

// Run the cleanup
clearProblematicJobs();
