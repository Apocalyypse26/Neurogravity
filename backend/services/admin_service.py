import os
import httpx
from typing import Optional, List, Dict, Any

class AdminService:
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.admin_users_table = "admin_users"
        self.uploads_table = "uploads"
        self.projects_table = "projects"
        
        if not self.supabase_service_key:
            env = os.getenv("ENVIRONMENT", "development")
            if env == "production":
                raise ValueError("SUPABASE_SERVICE_ROLE_KEY is required in production environments")
            print("[ADMIN] WARNING: SUPABASE_SERVICE_ROLE_KEY not set - admin features disabled")
    
    def _get_service_headers(self) -> Dict[str, str]:
        """Get headers for service role authentication"""
        if not self.supabase_service_key:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY is not configured")
        return {
            "apikey": self.supabase_service_key,
            "Authorization": f"Bearer {self.supabase_service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
    
    async def verify_admin(self, user_id: str) -> bool:
        """
        Verify if user is in admin_users table.
        Uses service role key to bypass RLS.
        """
        if not user_id or not self.supabase_service_key:
            print(f"[ADMIN] Missing user_id or service key")
            return False
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.supabase_url}/rest/v1/{self.admin_users_table}",
                    headers=self._get_service_headers(),
                    params={
                        "id": f"eq.{user_id}",
                        "select": "id",
                        "limit": 1
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    is_admin = len(data) > 0
                    print(f"[ADMIN] User {user_id} admin check: {is_admin}")
                    return is_admin
                else:
                    print(f"[ADMIN] Admin check failed with status {response.status_code}: {response.text}")
                    return False
                    
        except Exception as e:
            print(f"[ADMIN] Error verifying admin: {e}")
            return False
    
    async def get_all_uploads(self) -> List[Dict[str, Any]]:
        """Get all uploads with project info (admin only)"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.supabase_url}/rest/v1/{self.uploads_table}",
                    headers=self._get_service_headers(),
                    params={
                        "select": "*, projects(name)",
                        "order": "created_at.desc"
                    }
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    print(f"[ADMIN] Failed to fetch uploads: {response.status_code}")
                    return []
                    
        except Exception as e:
            print(f"[ADMIN] Error fetching uploads: {e}")
            return []
    
    async def get_upload_by_id(self, upload_id: str) -> Optional[Dict[str, Any]]:
        """Get single upload by ID"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.supabase_url}/rest/v1/{self.uploads_table}",
                    headers=self._get_service_headers(),
                    params={
                        "id": f"eq.{upload_id}",
                        "select": "*, projects(name)"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data[0] if data else None
                return None
                
        except Exception as e:
            print(f"[ADMIN] Error fetching upload: {e}")
            return None
    
    async def update_upload_feedback(self, upload_id: str, feedback: str) -> bool:
        """Update admin_feedback for an upload"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.patch(
                    f"{self.supabase_url}/rest/v1/{self.uploads_table}",
                    headers=self._get_service_headers(),
                    params={"id": f"eq.{upload_id}"},
                    json={"admin_feedback": feedback}
                )
                
                success = response.status_code in [200, 204]
                if success:
                    print(f"[ADMIN] Updated feedback for upload {upload_id}")
                else:
                    print(f"[ADMIN] Failed to update feedback: {response.status_code}")
                
                return success
                
        except Exception as e:
            print(f"[ADMIN] Error updating feedback: {e}")
            return False
    
    async def get_upload_stats(self) -> Dict[str, Any]:
        """Get platform-wide upload statistics"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get total uploads
                uploads_response = await client.get(
                    f"{self.supabase_url}/rest/v1/{self.uploads_table}",
                    headers=self._get_service_headers(),
                    params={"select": "id"}
                )
                
                # Get total projects
                projects_response = await client.get(
                    f"{self.supabase_url}/rest/v1/{self.projects_table}",
                    headers=self._get_service_headers(),
                    params={"select": "id"}
                )
                
                total_uploads = len(uploads_response.json()) if uploads_response.status_code == 200 else 0
                total_projects = len(projects_response.json()) if projects_response.status_code == 200 else 0
                
                return {
                    "total_uploads": total_uploads,
                    "total_projects": total_projects
                }
                
        except Exception as e:
            print(f"[ADMIN] Error fetching stats: {e}")
            return {"total_uploads": 0, "total_projects": 0}

# Global instance
admin_service = AdminService()
