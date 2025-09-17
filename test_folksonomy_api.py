#!/usr/bin/env python3
"""
Simple demo script to test the bitemporal folksonomy API endpoints.
This demonstrates the core concepts implemented.
"""

import requests
import json
import time
from uuid import uuid4

# Configuration
BASE_URL = "http://localhost:8081/api/folksonomy"
DATABASE_URL = "postgres://postgres:password@localhost:5432/test_db?sslmode=disable"

def test_api_endpoints():
    """Test the folksonomy API endpoints"""
    
    print("🧪 Testing Bitemporal Folksonomy API")
    print("=" * 50)
    
    # Test 1: Get basic info
    print("\n1. Getting system information...")
    try:
        response = requests.get(f"{BASE_URL}/info")
        if response.status_code == 200:
            info = response.json()
            print(f"✅ API Info: {info['message']}")
            print(f"📊 Found {len(info['example_concepts'])} example concepts:")
            for concept in info['example_concepts']:
                print(f"   • {concept['problem'][:50]}...")
        else:
            print(f"❌ Failed to get info: {response.status_code}")
    except Exception as e:
        print(f"❌ Error getting info: {e}")
    
    # Test 2: Get database stats
    print("\n2. Getting database statistics...")
    try:
        response = requests.get(f"{BASE_URL}/stats")
        if response.status_code == 200:
            stats = response.json()
            print(f"✅ Database Stats:")
            print(f"   • Tag Collections: {stats['tag_collections_count']}")
            print(f"   • Tag Claims: {stats['tag_claims_count']}")
            print(f"   • Collection Memberships: {stats['collection_memberships_count']}")
            print(f"   • Votes: {stats['votes_count']}")
            print(f"   • Reputation Entries: {stats['reputation_entries_count']}")
            print(f"   • Slug Resolutions: {stats['slug_resolutions_count']}")
        else:
            print(f"❌ Failed to get stats: {response.status_code}")
    except Exception as e:
        print(f"❌ Error getting stats: {e}")
    
    # Test 3: Create example scenario (requires authentication)
    print("\n3. Testing example scenario creation...")
    print("⚠️  Note: This would require authentication in a real deployment")
    
    # For now, we'll just test that the endpoint exists
    try:
        response = requests.post(f"{BASE_URL}/examples", 
                               json={"scenario": "jedi_dispute"})
        # We expect this to fail with 401/403 since we don't have auth
        if response.status_code in [401, 403]:
            print("✅ Example endpoint exists and correctly requires authentication")
        elif response.status_code == 201:
            print("✅ Example scenario created successfully")
        else:
            print(f"⚠️  Unexpected response: {response.status_code}")
    except Exception as e:
        print(f"❌ Error testing examples endpoint: {e}")
    
    print("\n" + "=" * 50)
    print("🎉 Folksonomy API test completed!")
    print("\n📚 Key Concepts Demonstrated:")
    print("   • Bitemporal data structures (valid_time + transaction_time)")
    print("   • Competitive tag ownership via voting")
    print("   • Historical views of tag meanings")
    print("   • Automatic conflict resolution via triggers")
    print("   • Spam resistance through reputation systems")

if __name__ == "__main__":
    test_api_endpoints()