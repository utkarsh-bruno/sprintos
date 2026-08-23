import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppConfig } from '@sprintos/types';
import { api } from '../lib/api.js';

type SettingsForm = {
  jiraUrl: string;
  jiraEmail: string;
  jiraToken: string;
  githubToken: string;
  leadAccountId: string;
  additionalReviewAccountId: string;
  prField: string;
};

function configToForm(config: AppConfig): SettingsForm {
  return {
    jiraUrl: config.jira.url,
    jiraEmail: config.jira.email,
    jiraToken: config.jira.token,
    githubToken: config.github.token,
    leadAccountId: config.people.lead.jiraAccountId,
    additionalReviewAccountId: config.people.additionalReview.jiraAccountId,
    prField: config.jira.prField,
  };
}

function formToPartialConfig(form: SettingsForm): Partial<AppConfig> {
  return {
    jira: {
      url: form.jiraUrl,
      email: form.jiraEmail,
      token: form.jiraToken,
      prField: form.prField,
    } as AppConfig['jira'],
    github: {
      token: form.githubToken,
    },
    people: {
      lead: {
        jiraAccountId: form.leadAccountId,
        actsAsDeveloper: true,
      },
      additionalReview: {
        jiraAccountId: form.additionalReviewAccountId,
      },
    },
  };
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saved, setSaved] = useState(false);

  const { data, isLoading, error, isError } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    retry: false,
  });

  useEffect(() => {
    if (data) {
      setForm(configToForm(data));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<AppConfig>) => api.putConfig(partial),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['config'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function updateField<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    saveMutation.mutate(formToPartialConfig(form));
  }

  return (
    <section className="panel">
      <div className="panel-heading">Settings</div>

      {isLoading && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">Loading configuration…</div>
      )}

      {isError && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          {error instanceof Error ? error.message : 'Failed to load configuration'}
        </div>
      )}

      {form && (
        <form className="space-y-6 px-5 py-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Jira URL
              </span>
              <input
                className="field w-full"
                value={form.jiraUrl}
                onChange={(e) => updateField('jiraUrl', e.target.value)}
                placeholder="https://your-org.atlassian.net"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Jira email
              </span>
              <input
                className="field w-full"
                type="email"
                value={form.jiraEmail}
                onChange={(e) => updateField('jiraEmail', e.target.value)}
                placeholder="you@company.com"
              />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Jira API token
              </span>
              <input
                className="field w-full"
                type="password"
                value={form.jiraToken}
                onChange={(e) => updateField('jiraToken', e.target.value)}
                placeholder="••••••"
                autoComplete="off"
              />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                GitHub token
              </span>
              <input
                className="field w-full"
                type="password"
                value={form.githubToken}
                onChange={(e) => updateField('githubToken', e.target.value)}
                placeholder="••••••"
                autoComplete="off"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Lead Jira account ID
              </span>
              <input
                className="field w-full"
                value={form.leadAccountId}
                onChange={(e) => updateField('leadAccountId', e.target.value)}
                placeholder="712020:…"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Additional review Jira account ID
              </span>
              <input
                className="field w-full"
                value={form.additionalReviewAccountId}
                onChange={(e) => updateField('additionalReviewAccountId', e.target.value)}
                placeholder="712020:…"
              />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Jira PR custom field ID
              </span>
              <input
                className="field w-full"
                value={form.prField}
                onChange={(e) => updateField('prField', e.target.value)}
                placeholder="customfield_10454"
              />
            </label>
          </div>

          {saveMutation.isError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : 'Failed to save configuration'}
            </div>
          )}

          {saved && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
              Configuration saved.
            </div>
          )}

          <button
            type="submit"
            className="button button-primary"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save configuration'}
          </button>
        </form>
      )}
    </section>
  );
}
