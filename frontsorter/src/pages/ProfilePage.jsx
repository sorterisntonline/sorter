import React from 'react';

function ProfilePage() {
  return (
    <div className="bg-white p-8">
      <h1 className="text-3xl font-semibold text-gray-800 mb-6">User Profile</h1>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Username</label>
          <p className="text-lg text-gray-900">DemoUser</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <p className="text-lg text-gray-900">demo@example.com</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Membership Tier</label>
          <p className="text-lg text-gray-900">Free (100 AI comparisons remaining)</p>
        </div>
        <button className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4">
          Upgrade Plan
        </button>
      </div>
    </div>
  );
}

export default ProfilePage;
