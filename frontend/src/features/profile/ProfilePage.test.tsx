import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  changePasswordMutate,
  profileState,
  toggleThemeMock,
  updatePreferencesMutate,
  updateProfileMutate,
} = vi.hoisted(() => ({
  changePasswordMutate: vi.fn(),
  profileState: {
    data: undefined as
      | {
          id: string
          name: string
          email: string
          preferences: {
            notificationsEnabled: boolean
            theme: 'dark' | 'light'
          }
          createdAt: string
          updatedAt: string
        }
      | undefined,
    isLoading: true,
  },
  toggleThemeMock: vi.fn(),
  updatePreferencesMutate: vi.fn(),
  updateProfileMutate: vi.fn(),
}))

vi.mock('../../app/providers/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'dark',
    toggleTheme: toggleThemeMock,
    setTheme: vi.fn(),
  }),
}))

vi.mock('./hooks/useProfile', () => ({
  useProfile: () => profileState,
  useUpdateProfile: () => ({
    mutate: updateProfileMutate,
    isPending: false,
  }),
  useUpdatePreferences: () => ({
    mutate: updatePreferencesMutate,
    isPending: false,
  }),
  useChangePassword: () => ({
    mutate: changePasswordMutate,
    isPending: false,
  }),
}))

import ProfilePage from './ProfilePage'

describe('ProfilePage', () => {
  beforeEach(() => {
    profileState.data = undefined
    profileState.isLoading = true
    changePasswordMutate.mockClear()
    toggleThemeMock.mockClear()
    updatePreferencesMutate.mockClear()
    updateProfileMutate.mockClear()
  })

  it('hydrates the form when the profile finishes loading', async () => {
    const { rerender } = render(<ProfilePage />)

    expect(screen.getByText('Carregando...')).toBeInTheDocument()

    profileState.data = {
      id: 'user-1',
      name: 'Thiago Vieira',
      email: 'thiago@example.com',
      preferences: {
        notificationsEnabled: false,
        theme: 'dark',
      },
      createdAt: '2026-04-01T12:00:00.000Z',
      updatedAt: '2026-04-11T12:00:00.000Z',
    }
    profileState.isLoading = false

    rerender(<ProfilePage />)

    expect(await screen.findByDisplayValue('Thiago Vieira')).toBeInTheDocument()
    expect(screen.getByDisplayValue('thiago@example.com')).toBeInTheDocument()
  })
})
