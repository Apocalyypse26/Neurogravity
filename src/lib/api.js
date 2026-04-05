const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
import { supabase } from './supabase';

const POLL_INTERVAL = 1500;
const MAX_POLL_ATTEMPTS = 60;

export async function createAnalysisJob(uploadId, mediaType, fileUrl) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_id: uploadId,
      media_type: mediaType,
      file_url: fileUrl
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  const result = await response.json();
  
  const tokenResponse = await fetch(`${API_BASE_URL}/api/jobs/${result.job_id}/token`, {
    headers: { 
      'Authorization': `Bearer ${await getAuthToken()}`
    }
  });
  
  if (tokenResponse.ok) {
    const tokenData = await tokenResponse.json();
    result.job_token = tokenData.token;
  }
  
  return result;
}

export async function getJobStatus(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  return response.json();
}

export async function getJobByUpload(uploadId) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/upload/${uploadId}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  return response.json();
}

export async function pollJobUntilComplete(jobId, onProgress) {
  let attempts = 0;
  
  while (attempts < MAX_POLL_ATTEMPTS) {
    const job = await getJobStatus(jobId);
    
    if (onProgress) {
      onProgress(job);
    }
    
    if (job.status === 'completed') {
      return job.result;
    }
    
    if (job.status === 'failed') {
      throw new Error(job.error || 'Analysis failed');
    }
    
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    attempts++;
  }
  
  throw new Error('Analysis timed out');
}

export async function runSyncAnalysis(uploadId, mediaType, fileUrl) {
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_id: uploadId,
      media_type: mediaType,
      file_url: fileUrl
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  return response.json();
}

export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    if (response.ok) {
      return response.json();
    }
    return null;
  } catch {
    return null;
  }
}

export async function getTribeInfo() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/tribe/info`);
    if (response.ok) {
      return response.json();
    }
    return null;
  } catch {
    return null;
  }
}

// --- Stripe Payment Functions ---

export async function getPackages() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/packages`);
    if (response.ok) {
      return response.json();
    }
    return null;
  } catch {
    return null;
  }
}

export async function createCheckoutSession(packageId, userId, email) {
  const successUrl = `${window.location.origin}/dashboard?payment=success`;
  const cancelUrl = `${window.location.origin}/dashboard/project`;

  const response = await fetch(`${API_BASE_URL}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      package_id: packageId,
      user_id: userId,
      email: email,
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function getCheckoutStatus(sessionId) {
  const response = await fetch(`${API_BASE_URL}/api/checkout/status/${sessionId}`);
  if (!response.ok) {
    throw new Error('Failed to get checkout status');
  }
  return response.json();
}

// --- Video Validation Functions ---

export async function validateVideo(fileUrl, maxDuration = 20) {
  const response = await fetch(`${API_BASE_URL}/api/validate-video`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getAuthToken()}`
    },
    body: JSON.stringify({
      file_url: fileUrl,
      max_duration: maxDuration
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    const errorDetail = error.detail || {};
    const errors = errorDetail.errors || [errorDetail.message || 'Validation failed'];
    throw new Error(errors.join(', '));
  }
  
  return response.json();
}

export async function getAuthToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  } catch {
    return '';
  }
}

// --- SSE Functions ---

export function subscribeToJob(jobId, options = {}) {
  const {
    onStatusUpdate,
    onProgress,
    onComplete,
    onError,
    jobToken = null
  } = options;
  
  let url = `${API_BASE_URL}/api/jobs/${jobId}/stream`;
  let eventSource;
  let retryCount = 0;
  const maxRetries = 5;
  let abortController = null;
  
  const getBackoffDelay = (attempt) => {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    return delay;
  };
  
  const connect = async () => {
    abortController = new AbortController();
    const authToken = await getAuthToken();
    
    try {
      const headers = {};
      if (jobToken) {
        url += `?token=${encodeURIComponent(jobToken)}`;
      } else if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: abortController.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.error) {
              onError?.(data.error);
              return;
            }
            
            if (data.type === 'done') {
              return;
            }
            
            onStatusUpdate?.(data);
            onProgress?.(data.progress, data.status);
            
            if (data.status === 'completed') {
              onComplete?.(data.result);
              return;
            } else if (data.status === 'failed') {
              onError?.(data.error || 'Analysis failed');
              return;
            }
          } catch (e) {
            console.error('SSE parse error:', e);
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      
      console.error('SSE error:', error);
      
      if (retryCount < maxRetries) {
        retryCount++;
        const delay = getBackoffDelay(retryCount);
        console.log(`SSE reconnecting in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
        setTimeout(() => {
          connect();
        }, delay);
      } else {
        onError?.('Connection lost. Please refresh the page.');
      }
    }
  };
  
  connect();
  
  return {
    close: () => {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
    }
  };
}
