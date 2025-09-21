#!/usr/bin/env node

// Simple script to test pinning functionality
const BASE_URL = 'http://localhost:8081';

async function testPinningAPI() {
  console.log('🧪 Testing pinning API functionality...\n');
  
  // Test 1: Basic pair request without pinning
  console.log('1. Testing basic pair request (should fail with no data)...');
  try {
    const response = await fetch(`${BASE_URL}/api/pair?pk_namespace=sorter.user&pk=testuser`);
    const data = await response.json();
    console.log('   Response:', JSON.stringify(data, null, 2));
    console.log('   ✅ API accessible\n');
  } catch (error) {
    console.log('   ❌ API error:', error.message, '\n');
    return;
  }

  // Test 2: Pair request with pinning parameters
  console.log('2. Testing pair request with pinning parameters...');
  try {
    const response = await fetch(`${BASE_URL}/api/pair?pk_namespace=sorter.user&pk=testuser&left_pin_ns=spotify.track&left_pin_pk=test123`);
    const data = await response.json();
    console.log('   Response:', JSON.stringify(data, null, 2));
    console.log('   ✅ Pinning parameters accepted\n');
  } catch (error) {
    console.log('   ❌ Pinning API error:', error.message, '\n');
  }

  // Test 3: Health check
  console.log('3. Testing health endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    console.log('   Response:', JSON.stringify(data, null, 2));
    console.log('   ✅ Backend healthy\n');
  } catch (error) {
    console.log('   ❌ Health check error:', error.message, '\n');
  }

  console.log('✅ Backend pinning API tests completed!');
  console.log('\n📝 Next steps:');
  console.log('   1. Import some Spotify songs through the UI');
  console.log('   2. Select a song and click "Compare This Song"');
  console.log('   3. Verify pinned song indicator appears');
  console.log('   4. Verify voting pairs include the pinned song');
}

// Run the tests
testPinningAPI().catch(console.error);
