const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
  
  return response.json();
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
