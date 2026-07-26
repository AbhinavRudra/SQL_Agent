"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/components/auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
// import { ThemeToggle } from '@/components/theme-toggle'
import {
  Database,
  MessageSquare,
  Zap,
  Shield,
  GitBranch,
  BarChart3,
  ArrowRight,
  Sparkles,
} from 'lucide-react'

const features = [
  {
    icon: MessageSquare,
    title: 'Natural Language Queries',
    description: 'Ask questions in plain English and get precise SQL queries instantly.',
  },
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Optimized query generation with real-time performance metrics.',
  },
  {
    icon: Shield,
    title: 'Secure by Design',
    description: 'Your data stays in your database. We never store your credentials.',
  },
  {
    icon: GitBranch,
    title: 'Interactive ER Diagrams',
    description: 'Visualize your database schema and click to generate queries.',
  },
  {
    icon: BarChart3,
    title: 'Result Analytics',
    description: 'Get insights and visualizations along with your query results.',
  },
  {
    icon: Sparkles,
    title: 'AI Reasoning',
    description: 'See how the AI thinks and generates your SQL queries.',
  },
]

export default function HomePage() {
  const router = useRouter()
  const { isLoading, isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard')
    }
  }, [isLoading, isAuthenticated, router])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <Database className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-primary">SQL Agent</span>
          </div>
          <div className="flex items-center gap-3">
            {/* <ThemeToggle />
            <Button variant="outline" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <Link href="/register">Get Started</Link>
            </Button> */}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-full text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            AI-Powered SQL Generation
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-primary leading-tight text-balance">
            Query Your Database in Plain English
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
            Transform natural language into precise SQL queries. Connect your database, ask
            questions in English, and let our AI handle the rest.
          </p>
          <div className="flex items-center justify-center gap-4 pt-4">
            <Button size="lg" asChild className="bg-primary hover:bg-primary/90 gap-2">
              <Link href="/register">
                Start Free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#features">Learn More</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
              Everything You Need
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Powerful features to help you query, analyze, and understand your data without writing SQL.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <Card key={i} className="border-primary/10 hover:border-primary/30 transition-colors">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="text-lg font-semibold text-primary mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-primary text-primary-foreground border-0 overflow-hidden">
            <CardContent className="p-12 text-center relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Get Started?</h2>
                <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">
                  Join thousands of developers and data analysts who are already querying databases
                  with natural language.
                </p>
                <Button
                  size="lg"
                  variant="secondary"
                  asChild
                  className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 gap-2"
                >
                  <Link href="/register">
                    Create Free Account
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Database className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-primary">SQL Agent</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Built with a Deep Vintage Mood. Query smarter, not harder.
          </p>
        </div>
      </footer>
    </div>
  )
}
