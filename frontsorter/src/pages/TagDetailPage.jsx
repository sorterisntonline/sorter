import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';

function TagDetailPage() {
  return ( 
    <div>
      <Link to="/tags" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4">
        <FaArrowLeft className="mr-2" /> Back to All Topics
      </Link>
      <h1>Tag Detail Page</h1>
    </div>
  )
}

export default TagDetailPage; 