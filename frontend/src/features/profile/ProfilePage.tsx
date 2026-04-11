import { useEffect, useState } from 'react'
import { Bell, Key, Save, User } from 'lucide-react'
import { useTheme } from '../../app/providers/ThemeProvider'
import { Button } from '../../shared/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../shared/components/ui/Card'
import { Input } from '../../shared/components/ui/Input'
import { Label } from '../../shared/components/ui/Label'
import { Switch } from '../../shared/components/ui/Switch'
import { Skeleton } from '../../shared/components/ui/Skeleton'
import { useProfile, useUpdateProfile, useUpdatePreferences, useChangePassword } from './hooks/useProfile'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { theme, toggleTheme } = useTheme()
  const { data: profile, isLoading } = useProfile()
  const { mutate: updateProfile, isPending: isUpdatingProfile } = useUpdateProfile()
  const { mutate: updatePreferences, isPending: isUpdatingPreferences } = useUpdatePreferences()
  const { mutate: changePassword, isPending: isChangingPassword } = useChangePassword()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setEmail(profile.email)
      setNotificationsEnabled(profile.preferences?.notificationsEnabled ?? true)
    }
  }, [profile?.id, profile?.name, profile?.email, profile?.preferences?.notificationsEnabled])

  const handleSaveProfile = () => {
    updateProfile({ name, email })
  }

  const handleSavePreferences = () => {
    updatePreferences({ notificationsEnabled, theme: theme === 'dark' ? 'dark' : 'light' })
  }

  const handleChangePassword = () => {
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('As senhas não coincidem')
      return
    }
    if (passwords.newPassword.length < 8) {
      toast.error('A nova senha deve ter no mínimo 8 caracteres')
      return
    }
    
    changePassword({
      currentPassword: passwords.currentPassword,
      newPassword: passwords.newPassword,
      confirmPassword: passwords.confirmPassword
    }, {
      onSuccess: () => {
        setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
      }
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6 pb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Perfil</h1>
          <p className="text-gray-400 mt-1">Carregando...</p>
        </div>
        <div className="grid grid-cols-1 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-80" />
          <Skeleton className="h-48" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Perfil</h1>
        <p className="text-gray-400 mt-1">Gerencie suas informações e preferências</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Informações Pessoais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary-500" />
              Informações Pessoais
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input 
                  placeholder="Seu nome" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input 
                  type="email" 
                  placeholder="seu@email.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button 
                onClick={handleSaveProfile} 
                disabled={isUpdatingProfile}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isUpdatingProfile ? 'Salvando...' : 'Salvar informações'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Segurança */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary-500" />
              Segurança
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Senha atual</Label>
              <Input 
                type="password" 
                placeholder="Digite sua senha atual"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input 
                type="password" 
                placeholder="Digite a nova senha"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input 
                type="password" 
                placeholder="Confirme a nova senha"
                value={passwords.confirmPassword}
                onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
              />
            </div>

            <div className="flex justify-end">
              <Button 
                variant="secondary" 
                onClick={handleChangePassword}
                disabled={!passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword || isChangingPassword}
              >
                {isChangingPassword ? 'Alterando...' : 'Alterar Senha'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preferências */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary-500" />
              Preferências
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 rounded-2xl border border-dark-300 bg-dark-300/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 pr-2">
                <p className="font-medium text-white">Notificações push</p>
                <p className="mt-1 text-sm text-gray-400">Receber notificações no navegador</p>
              </div>
              <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} className="shrink-0" />
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-dark-300 bg-dark-300/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 pr-2">
                <p className="font-medium text-white">Tema escuro</p>
                <p className="mt-1 text-sm text-gray-400">Alternar entre tema claro e escuro</p>
              </div>
              <Switch checked={theme === 'dark'} onCheckedChange={() => toggleTheme()} className="shrink-0" />
            </div>

            <div className="flex justify-end">
              <Button 
                onClick={handleSavePreferences} 
                disabled={isUpdatingPreferences}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isUpdatingPreferences ? 'Salvando...' : 'Salvar preferências'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
