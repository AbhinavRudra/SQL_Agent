"use client"

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, Database } from 'lucide-react'

export default function RegisterSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-2 border-primary/20 shadow-xl text-center">
        <CardHeader className="space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary rounded-xl flex items-center justify-center">
            <Database className="w-8 h-8 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-primary">Check Your Email</CardTitle>
            <CardDescription className="text-muted-foreground">
              We&apos;ve sent you a confirmation link
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="mx-auto w-20 h-20 bg-muted rounded-full flex items-center justify-center">
            <Mail className="w-10 h-10 text-primary" />
          </div>
          <p className="text-muted-foreground">
            Please check your email inbox and click the confirmation link to activate your account.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">
              Back to Sign In
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
