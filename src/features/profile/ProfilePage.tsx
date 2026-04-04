import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../shared/components/ui/Card'
import { Input } from '../../shared/components/ui/Input'
import { Label } from '../../shared/components/ui/Label'
import { Button } from '../../shared/components/ui/Button'
import { User, Mail, Key, Bell, Save } from 'lucide-react'
import { useTheme } from '../../app/providers/ThemeProvider'
import { Switch } from '../../shared/components/ui/Switch'

export default function ProfilePage() {
  const { theme, toggleTheme } = useTheme()
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Perfil</h1>
        <p className="text-gray-400 mt-1">Gerencie suas informações e preferências</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        {/* Informações Pessoais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary-500" />
              Informações Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Mail className="w-4 h-4" />
                Email
              </Label>
              <Input type="email" placeholder="seu@email.com" defaultValue="thiago@email.com" />
            </div>
          </CardContent>
        </Card>

        {/* Segurança */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary-500" />
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

        {/* Preferências */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary-500" />
              Preferências
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white">Notificações push</p>
                <p className="text-xs text-gray-500">Receber notificações no navegador</p>
              </div>
              <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white">Tema escuro</p>
                <p className="text-xs text-gray-500">Alternar entre tema claro e escuro</p>
              </div>
              <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
            </div>
          </CardContent>
        </Card>

        {/* Botão Salvar */}
        <div className="flex justify-end">
          <Button className="gap-2">
            <Save className="w-4 h-4" />
            Salvar alterações
          </Button>
        </div>
      </div>
    </div>
  )
}