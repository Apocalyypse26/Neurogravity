import os
import jwt
from typing import Optional
from fastapi import HTTPException, Header, Depends

class AuthService:
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
        configured_jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
        
        if not configured_jwt_secret:
            env = os.getenv("ENVIRONMENT", "development")
            if env == "production":
                raise ValueError("SUPABASE_JWT_SECRET is required in production environments")
            print("[AUTH] WARNING: SUPABASE_JWT_SECRET not set - using anon key (INSECURE for production)")
            configured_jwt_secret = self.supabase_anon_key
        
        self.supabase_jwt_secret = configured_jwt_secret
    
    def verify_token(self, authorization: str) -> Optional[dict]:
        """Extract and verify JWT token, return decoded payload"""
        if not authorization:
            return None
        
        try:
            # Remove "Bearer " prefix
            token = authorization.replace("Bearer ", "")
            
            # Decode JWT
            # Supabase uses HS256 algorithm by default
            decoded = jwt.decode(
                token,
                self.supabase_jwt_secret,
                algorithms=["HS256"],
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_iat": True,
                    "require": ["exp", "iat", "sub"]
                }
            )
            
            return decoded
        except jwt.ExpiredSignatureError:
            print("[AUTH] Token has expired")
            return None
        except jwt.InvalidTokenError as e:
            print(f"[AUTH] Invalid token: {e}")
            return None
    
    def get_user_id_from_token(self, authorization: str) -> Optional[str]:
        """Extract user_id from JWT token"""
        decoded = self.verify_token(authorization)
        if decoded:
            return decoded.get("sub")
        return None
    
    async def get_current_user(self, authorization: str = Header(None)) -> dict:
        """
        Dependency for FastAPI routes to get verified user info.
        Raises 401 if token is missing or invalid.
        """
        if not authorization:
            raise HTTPException(
                status_code=401,
                detail="Missing authorization header",
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        decoded = self.verify_token(authorization)
        if not decoded:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        return {
            "user_id": decoded.get("sub"),
            "email": decoded.get("email"),
            "role": decoded.get("role", "authenticated")
        }
    
    def create_service_token(self, user_id: str, is_admin: bool = False) -> str:
        """
        Create a service-level JWT for internal use.
        Used by services to make authenticated requests to Supabase.
        """
        import time
        
        payload = {
            "sub": user_id,
            "role": "service_role" if is_admin else "authenticated",
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,  # 1 hour expiry
            "iss": self.supabase_url,
            "prn": user_id
        }
        
        return jwt.encode(payload, self.supabase_jwt_secret, algorithm="HS256")

# Global instance
auth_service = AuthService()
