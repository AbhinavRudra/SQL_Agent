"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Database,
  Github,
  Twitter,
  Linkedin,
  Mail,
  Send,
  Loader2,
  CheckCircle,
  Sparkles,
  Zap,
  Shield,
} from 'lucide-react'

const teamMembers = [
  {
    name: 'Abhinav M',
    role: 'Lead Developer',
    bio: 'Full-stack engineer with a passion for AI and databases. Building tools that make data accessible to everyone.',
    avatar: '',
    twitter: 'abhinavm',
    linkedin: 'abhinavm',
    github: 'abhinavm',
  },
  {
    name: 'Abin Roy',
    role: 'AI/ML Engineer',
    bio: 'Specializing in natural language processing and query optimization. Making SQL speak human.',
    avatar: '',
    twitter: 'abinroy',
    linkedin: 'abinroy',
    github: 'abinroy',
  },
  {
    name: 'Alok',
    role: 'Product Designer',
    bio: 'Creating intuitive interfaces that bridge the gap between complex data and user-friendly experiences.',
    avatar: '',
    twitter: 'alokdesigns',
    linkedin: 'alokdesigns',
    github: 'alokdesigns',
  },
]

const features = [
  {
    icon: Sparkles,
    title: 'Natural Language Queries',
    description: 'Ask questions in plain English and get SQL instantly.',
  },
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Optimized queries with performance metrics.',
  },
  {
    icon: Shield,
    title: 'Secure by Design',
    description: 'Your data never leaves your database.',
  },
]

export function AboutTab() {
  const [feedbackForm, setFeedbackForm] = useState({
    name: '',
    email: '',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    // Simulate API call
    await new Promise((r) => setTimeout(r, 1500))
    
    setIsSubmitting(false)
    setIsSubmitted(true)
    setFeedbackForm({ name: '', email: '', message: '' })
    
    setTimeout(() => setIsSubmitted(false), 5000)
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-8 max-w-2xl mx-auto">
        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center mx-auto">
            <Database className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-primary text-balance">
            Natural Language to SQL Agent
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto text-pretty">
            Transform your questions into powerful SQL queries instantly. No SQL expertise required
            just ask in plain English and let our AI do the heavy lifting.
          </p>
        </div>

        {/* Features */}
        <div className="grid gap-4">
          {features.map((feature, i) => (
            <Card key={i} className="border-primary/20">
              <CardContent className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center shrink-0">
                  <feature.icon className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-primary">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mission */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-primary">Our Mission</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-pretty">
              We believe that data should be accessible to everyone, not just those who speak SQL.
              Our mission is to democratize data access by creating intelligent tools that understand
              natural language and translate it into precise database queries. Whether you are a
              business analyst, a product manager, or just curious about your data, our SQL Agent
              empowers you to explore and analyze without barriers.
            </p>
          </CardContent>
        </Card>

        {/* Team */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-primary">Meet the Team</h2>
          <div className="grid gap-4">
            {teamMembers.map((member, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="w-14 h-14 border-2 border-primary/20">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                        {member.name.split(' ').map((n) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold text-primary">{member.name}</h3>
                      <p className="text-sm text-accent font-medium">{member.role}</p>
                      <p className="text-sm text-muted-foreground mt-1">{member.bio}</p>
                      <div className="flex items-center gap-2 mt-3">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
                          <a href={`https://twitter.com/${member.twitter}`} target="_blank" rel="noopener noreferrer">
                            <Twitter className="w-4 h-4" />
                          </a>
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
                          <a href={`https://linkedin.com/in/${member.linkedin}`} target="_blank" rel="noopener noreferrer">
                            <Linkedin className="w-4 h-4" />
                          </a>
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
                          <a href={`https://github.com/${member.github}`} target="_blank" rel="noopener noreferrer">
                            <Github className="w-4 h-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Feedback Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-primary flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Send Us Feedback
            </CardTitle>
            <CardDescription>
              We would love to hear from you! Share your thoughts, suggestions, or report issues.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSubmitted ? (
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg text-green-700 dark:text-green-400">
                <CheckCircle className="w-5 h-5" />
                <span>Thank you for your feedback! We will get back to you soon.</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <FieldGroup>
                  <div className="grid grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel htmlFor="feedback-name">Name</FieldLabel>
                      <Input
                        id="feedback-name"
                        value={feedbackForm.name}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, name: e.target.value })}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="feedback-email">Email</FieldLabel>
                      <Input
                        id="feedback-email"
                        type="email"
                        value={feedbackForm.email}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, email: e.target.value })}
                        required
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="feedback-message">Message</FieldLabel>
                    <Textarea
                      id="feedback-message"
                      rows={4}
                      value={feedbackForm.message}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, message: e.target.value })}
                      placeholder="Share your thoughts, suggestions, or report an issue..."
                      required
                    />
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Feedback
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Social Links */}
        <div className="text-center space-y-4 pb-8">
          <p className="text-sm text-muted-foreground">Connect with us</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="lg" className="gap-2" asChild>
              <a href="https://github.com/AbhinavRudra" target="_blank" rel="noopener noreferrer">
                <Github className="w-5 h-5" />
                GitHub
              </a>
            </Button>
            <Button variant="outline" size="lg" className="gap-2" asChild>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">
                <Twitter className="w-5 h-5" />
                Twitter
              </a>
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
