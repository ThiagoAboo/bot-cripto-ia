export interface Profile {
    id: string
    name: string
    email: string
    preferences: {
      theme: 'dark' | 'light'
    }
    createdAt: string
    updatedAt: string
  }
  
  export interface UpdateProfileRequest {
    name: string
    email: string
  }
  
export interface UpdatePreferencesRequest {
    theme: 'dark' | 'light'
  }
  
  export interface ChangePasswordRequest {
    currentPassword: string
    newPassword: string
    confirmPassword: string
  }
