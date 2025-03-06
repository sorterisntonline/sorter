import React, { useState, useEffect, useRef } from "react";
import { current_session, fetchSession } from "./session";
import { useLocation } from "wouter";
import { formatDistanceToNow } from 'date-fns';

const APIKeys = () => {
  const [location, setLocation] = useLocation();
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState(null);
  const [nameError, setNameError] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState({ type: "", name: "" });
  const [copiedKey, setCopiedKey] = useState(false);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const modalRef = useRef(null);
  const confirmModalRef = useRef(null);

  // Check session status
  useEffect(() => {
    const checkSession = async () => {
      await fetchSession();
      setSessionChecked(true);
    };
    
    checkSession();
  }, []);

  // Redirect if not logged in (only after session check is complete)
  useEffect(() => {
    if (sessionChecked && !current_session.value) {
      setLocation("/login");
    }
  }, [current_session.value, sessionChecked, setLocation]);

  // Handle clicks outside modals
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showModal && modalRef.current && !modalRef.current.contains(event.target)) {
        resetModal();
      }
      if (showConfirmModal && confirmModalRef.current && !confirmModalRef.current.contains(event.target)) {
        setShowConfirmModal(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showModal, showConfirmModal]);

  // Fetch API keys
  const fetchApiKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/keys/", {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.api_keys || []);
      } else {
        const errorText = await response.text();
        console.error("Failed to fetch API keys:", errorText);
        setError(`Failed to fetch API keys: ${errorText}`);
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
      setError(`Error fetching API keys: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, []);

  // Handle creating a new API key
  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      setNameError("Key name is required");
      return;
    }

    // Check if name already exists
    if (apiKeys.some(key => key.name === newKeyName)) {
      setNameError("Key with this name already exists");
      return;
    }

    try {
      const response = await fetch("/api/keys/", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewKey(data.api_key);
        await fetchApiKeys();
      } else {
        const errorText = await response.text();
        console.error("Failed to create API key:", errorText);
        setNameError(`Failed to create API key: ${errorText}`);
      }
    } catch (error) {
      console.error("Error creating API key:", error);
      setNameError(`Error creating API key: ${error.message}`);
    }
  };

  // Handle regenerating an API key
  const handleRegenerateKey = async (name) => {
    try {
      const response = await fetch("/api/keys/regenerate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewKey(data.api_key);
        await fetchApiKeys();
        setShowConfirmModal(false);
      } else {
        const errorText = await response.text();
        console.error("Failed to regenerate API key:", errorText);
        setError(`Failed to regenerate API key: ${errorText}`);
      }
    } catch (error) {
      console.error("Error regenerating API key:", error);
      setError(`Error regenerating API key: ${error.message}`);
    }
  };

  // Handle revoking an API key
  const handleRevokeKey = async (name) => {
    try {
      const response = await fetch("/api/keys/revoke", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        await fetchApiKeys();
        setShowConfirmModal(false);
      } else {
        const errorText = await response.text();
        console.error("Failed to revoke API key:", errorText);
        setError(`Failed to revoke API key: ${errorText}`);
      }
    } catch (error) {
      console.error("Error revoking API key:", error);
      setError(`Error revoking API key: ${error.message}`);
    }
  };

  // Show confirmation modal
  const showConfirm = (type, name) => {
    setConfirmAction({ type, name });
    setShowConfirmModal(true);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + " " + date.toLocaleTimeString();
    } catch (e) {
      return "Invalid date";
    }
  };

  // Format relative time
  const formatRelativeTime = (dateString) => {
    if (!dateString || dateString === "null") return "Never used";
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (e) {
      return "Invalid date";
    }
  };

  // Copy to clipboard with animation
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Reset modal state
  const resetModal = () => {
    setShowModal(false);
    setNewKeyName("");
    setNameError("");
    setNewKey(null);
    setCopiedKey(false);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6 dark:text-white">API Keys</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p>{error}</p>
          <button 
            onClick={() => {
              setError(null);
              fetchApiKeys();
            }}
            className="text-blue-500 underline mt-2"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 dark:text-white">Loading API keys...</div>
      ) : apiKeys.length === 0 ? (
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-4">You don't have any API keys yet.</p>
          <p className="text-gray-500 dark:text-gray-400">
            API keys allow you to access the Sorter API programmatically.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium dark:text-white">Your API Keys</h2>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center"
              title="Create New API Key"
            >
              <span className="text-xl">+</span>
            </button>
          </div>
          
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {apiKeys.map((key) => (
              <li 
                key={key.name} 
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750"
                onMouseEnter={() => setHoveredKey(key.name)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <div className="mb-3 sm:mb-0 relative group">
                  <div className="flex items-center">
                    <h3 className="font-medium dark:text-white mr-2">{key.name}</h3>
                    <div className="text-gray-400 dark:text-gray-500 text-sm italic">
                      {formatRelativeTime(key.last_used_at)}
                    </div>
                  </div>
                  
                  {/* Preview only shows on hover */}
                  <div className="mt-1">
                    {hoveredKey === key.name && (
                      <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded dark:text-gray-300">
                        {key.preview || "sort_..."}
                      </code>
                    )}
                    {hoveredKey !== key.name && (
                      <div className="h-6"></div> // Placeholder to maintain height
                    )}
                  </div>
                  
                  {/* Created date tooltip */}
                  <div className="absolute left-0 top-full mt-1 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 pointer-events-none">
                    Created: {formatDate(key.created_at)}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => showConfirm("regenerate", key.name)}
                    className="text-blue-500 hover:text-blue-700 text-sm border border-blue-500 hover:border-blue-700 rounded px-3 py-1"
                  >
                    Regenerate
                  </button>
                  <button
                    onClick={() => showConfirm("revoke", key.name)}
                    className="text-red-500 hover:text-red-700 text-sm border border-red-500 hover:border-red-700 rounded px-3 py-1"
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Create Key Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div 
            ref={modalRef}
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full"
          >
            <h2 className="text-xl font-bold mb-4 dark:text-white">
              {newKey ? "API Key Created" : "Create New API Key"}
            </h2>
            
            {newKey ? (
              <div>
                <p className="mb-2 dark:text-gray-300">
                  Your new API key has been created. Please copy it now as you won't be able to see it again.
                </p>
                <div 
                  className="bg-gray-100 dark:bg-gray-700 p-3 rounded mb-4 overflow-x-auto relative cursor-pointer group"
                  onClick={() => copyToClipboard(newKey)}
                >
                  <code className="text-sm break-all dark:text-white">{newKey}</code>
                  
                  {/* Hover tooltip */}
                  <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="text-white text-sm font-medium">
                      {copiedKey ? "Copied!" : "Click to copy"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(newKey)}
                  className={`${
                    copiedKey 
                      ? "bg-green-500 hover:bg-green-600" 
                      : "bg-blue-500 hover:bg-blue-600"
                  } text-white px-4 py-2 rounded w-full mb-2 transition-colors duration-300`}
                >
                  {copiedKey ? "Copied to Clipboard! ✓" : "Copy to Clipboard"}
                </button>
                <button
                  onClick={resetModal}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded w-full"
                >
                  Close
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <label className="block text-gray-700 dark:text-gray-300 mb-2">
                    Key Name
                  </label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => {
                      setNewKeyName(e.target.value);
                      setNameError("");
                    }}
                    className={`w-full px-3 py-2 border rounded ${
                      nameError ? "border-red-500" : "border-gray-300 dark:border-gray-600"
                    } dark:bg-gray-700 dark:text-white`}
                    placeholder="e.g., my-app-key"
                  />
                  {nameError && (
                    <p className="text-red-500 text-sm mt-1">{nameError}</p>
                  )}
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={resetModal}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
                  >
                    Create
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div 
            ref={confirmModalRef}
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full"
          >
            <h2 className="text-xl font-bold mb-4 dark:text-white">
              {confirmAction.type === "regenerate" ? "Regenerate API Key" : "Revoke API Key"}
            </h2>
            <p className="mb-6 dark:text-gray-300">
              {confirmAction.type === "regenerate"
                ? "Are you sure you want to regenerate this API key? The old key will no longer work."
                : "Are you sure you want to revoke this API key? This action cannot be undone."}
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmAction.type === "regenerate") {
                    handleRegenerateKey(confirmAction.name);
                  } else {
                    handleRevokeKey(confirmAction.name);
                  }
                }}
                className={`${
                  confirmAction.type === "regenerate"
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-red-500 hover:bg-red-600"
                } text-white px-4 py-2 rounded`}
              >
                {confirmAction.type === "regenerate" ? "Regenerate" : "Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default APIKeys; 