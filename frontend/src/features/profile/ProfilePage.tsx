import { useState } from 'react'
import { Bell, Key, Mail, Save, User } from 'lucide-react'
import { useTheme } from '../../app/providers/ThemeProvider'
import { Button } from '../../shared/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../shared/components/ui/Card'
import { Input } from '../../shared/components/ui/Input'
import { Label } from '../../shared/components/ui/Label'
import { Switch } from '../../shared/components/ui/Switch'

export default function ProfilePage() {
  const { theme, toggleTheme } = useTheme()
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="app-page-title text-2xl font-bold">Perfil</h1>
        <p className="app-page-subtitle mt-1">Gerencie suas informações e preferências</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
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
                <Input placeholder="Seu nome" defaultValue="Thiago Aboo" />
              </div>

              <div className="space-y-2">
                <Label>Sobrenome</Label>
                <Input placeholder="Seu sobrenome" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </Label>
              <Input type="email" placeholder="seu@email.com" defaultValue="thiago@email.com" />
            </div>
          </CardContent>
        </Card>

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
              <Input type="password" placeholder="Digite sua senha atual" />
            </div>

            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input type="password" placeholder="Digite a nova senha" />
            </div>

            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input type="password" placeholder="Confirme a nova senha" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary-500" />
              Preferências
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 pr-2">
                <p className="font-medium text-[var(--color-text)]">Notificações push</p>
                <p className="mt-1 text-sm text-[var(--color-text-subtle)]">Receber notificações no navegador</p>
              </div>
              <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} className="shrink-0" />
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 pr-2">
                <p className="font-medium text-[var(--color-text)]">Tema escuro</p>
                <p className="mt-1 text-sm text-[var(--color-text-subtle)]">Alternar entre tema claro e escuro</p>
              </div>
              <Switch checked={theme === 'dark'} onCheckedChange={() => toggleTheme()} className="shrink-0" />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button className="gap-2">
            <Save className="h-4 w-4" />
            Salvar alterações
          </Button>
        </div>
      </div>
    </div>
  )
}
