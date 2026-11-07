"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Sparkles } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth/client";
import { AGENT_PRESETS, detectPresetFromPrompt } from "@/lib/agent/presets";

interface MailboxAgentConfigCardProps {
	mailboxId: string;
	mailboxAddress: string;
}

interface AgentSettingsResponse {
	settings: {
		mailboxId: string;
		enabled: boolean;
		modelId: string | null;
		autoDraftEnabled: boolean;
		reviewerUserId: string | null;
		instructions: string;
		dailyLimit: number;
	};
	models: string[];
	canManage: boolean;
	canConfigureProvider: boolean;
	providerConfigured: boolean;
	provider: { kind: string; model: string } | null;
	autoReplyEnabled: boolean;
	reviewers: { id: string; name: string; email: string }[];
}

export default function MailboxAgentConfigCard({ mailboxId, mailboxAddress }: MailboxAgentConfigCardProps) {
	const qc = useQueryClient();
	const [instructions, setInstructions] = useState("");
	const [autoDraftEnabled, setAutoDraftEnabled] = useState(false);
	const [modelId, setModelId] = useState<string>("");
	const [reviewerUserId, setReviewerUserId] = useState<string>("");
	const [dailyLimit, setDailyLimit] = useState(25);
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

	const query = useQuery({
		queryKey: ["mailbox-agent-settings", mailboxId],
		queryFn: async () => {
			const res = await authFetch(`/api/agent/settings?mailboxId=${encodeURIComponent(mailboxId)}`);
			if (!res.ok) throw new Error("Failed to load mailbox agent settings");
			return (await res.json()) as AgentSettingsResponse;
		},
		enabled: !!mailboxId,
	});

	useEffect(() => {
		if (query.data) {
			const s = query.data.settings;
			setInstructions(s.instructions ?? "");
			setAutoDraftEnabled(Boolean(s.autoDraftEnabled));
			setModelId(s.modelId ?? query.data.models[0] ?? "");
			setReviewerUserId(s.reviewerUserId ?? query.data.reviewers[0]?.id ?? "");
			setDailyLimit(s.dailyLimit ?? 25);
			const detected = detectPresetFromPrompt(s.instructions ?? "");
			setSelectedPresetId(detected?.id ?? null);
		}
	}, [query.data]);

	const saveMutation = useMutation({
		mutationFn: async () => {
			setStatusMessage(null);
			const res = await authFetch("/api/agent/settings", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mailboxId,
					enabled: true,
					modelId: modelId || null,
					autoDraftEnabled,
					reviewerUserId: reviewerUserId || null,
					instructions,
					dailyLimit: Number(dailyLimit) || 25,
				}),
			});
			const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok) throw new Error(json.error ?? "Failed to save agent settings");
			return json;
		},
		onSuccess: () => {
			setStatusMessage({ type: "success", text: "AI agent settings saved successfully for this mailbox!" });
			qc.invalidateQueries({ queryKey: ["mailbox-agent-settings", mailboxId] });
			qc.invalidateQueries({ queryKey: ["mailboxes"] });
			qc.invalidateQueries({ queryKey: ["agent-swarm"] });
		},
		onError: (err) => {
			setStatusMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save settings" });
		},
	});

	const applyPreset = (presetId: string) => {
		const preset = AGENT_PRESETS.find((p) => p.id === presetId);
		if (!preset) return;
		setInstructions(preset.prompt);
		setSelectedPresetId(preset.id);
		setStatusMessage({ type: "success", text: `Applied template: "${preset.name}". Click Save to deploy.` });
	};

	if (query.isLoading) {
		return <Skeleton className="h-96 w-full rounded-3xl" />;
	}

	const data = query.data;
	const isConfigured = Boolean(instructions && instructions.trim().length > 0);

	return (
		<Card className="rounded-3xl border-0 bg-white p-6 shadow-sm">
			<CardHeader className="py-0">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<CardTitle className="flex items-center gap-2.5 text-lg font-semibold text-neutral-900">
						<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
							<Bot className="h-5 w-5" />
						</span>
						Autonomous AI Agent & Auto-Drafting
					</CardTitle>
					<div className="flex items-center gap-2">
						{autoDraftEnabled ? (
							<Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-200">
								⚡ Auto-Drafting Active
							</Badge>
						) : isConfigured ? (
							<Badge className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 border-blue-200">
								🤖 Assistant Ready
							</Badge>
						) : (
							<Badge variant="outline" className="text-neutral-500">
								Inactive
							</Badge>
						)}
					</div>
				</div>
				<CardDescription className="mt-1 text-sm text-neutral-500">
					Deploy a dedicated AI agent to handle <span className="font-mono text-neutral-700">{mailboxAddress}</span>. The agent drafts replies with thread context and executes specific business rules.
				</CardDescription>
			</CardHeader>

			<CardContent className="space-y-6 pt-5">
				{/* Auto-Drafting Toggle */}
				<div className="flex items-center justify-between gap-4 rounded-2xl bg-neutral-50 p-4 border border-neutral-100">
					<div className="space-y-0.5">
						<label htmlFor="auto-draft-switch" className="text-sm font-semibold text-neutral-900 cursor-pointer">
							Automatic Background Reply Drafting
						</label>
						<p className="text-xs text-neutral-500">
							When a new customer email lands in this inbox, the agent automatically crafts an intelligent draft for review.
						</p>
					</div>
					<Switch
						id="auto-draft-switch"
						checked={autoDraftEnabled}
						disabled={!data?.canManage || data?.autoReplyEnabled || saveMutation.isPending}
						onCheckedChange={(checked) => setAutoDraftEnabled(checked)}
					/>
				</div>

				{data?.autoReplyEnabled && (
					<p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
						⚠️ Standard Out-of-Office auto-reply is currently enabled. Disable Out-of-Office to allow AI auto-drafting.
					</p>
				)}

				{/* 1-Click Preset Personas */}
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
							1-Click Persona & System Prompt Templates
						</Label>
						<span className="text-xs text-blue-600 font-medium flex items-center gap-1">
							<Sparkles className="h-3.5 w-3.5" /> Ready-to-deploy
						</span>
					</div>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						{AGENT_PRESETS.map((preset) => {
							const isSelected = selectedPresetId === preset.id;
							return (
								<button
									key={preset.id}
									type="button"
									onClick={() => applyPreset(preset.id)}
									disabled={!data?.canManage || saveMutation.isPending}
									className={`flex flex-col items-start rounded-xl p-3 text-left transition-all border ${
										isSelected
											? "border-blue-500 bg-blue-50/70 text-blue-900 shadow-sm ring-1 ring-blue-500"
											: "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 text-neutral-800"
									}`}
								>
									<span className="text-xs font-semibold leading-tight">{preset.name}</span>
									<span className="mt-1 text-[11px] text-neutral-500 line-clamp-1">{preset.shortRole}</span>
								</button>
							);
						})}
					</div>
				</div>

				{/* Instructions Textarea */}
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label htmlFor="agent-instructions" className="text-sm font-semibold text-neutral-900">
							Custom Agent Instructions (System Prompt)
						</Label>
						<span className="text-xs text-neutral-400 font-mono">
							{instructions.length} / 4,000 chars
						</span>
					</div>
					<textarea
						id="agent-instructions"
						rows={7}
						value={instructions}
						onChange={(e) => {
							setInstructions(e.target.value);
							setSelectedPresetId(null);
						}}
						disabled={!data?.canManage || saveMutation.isPending}
						placeholder="Define your agent's persona, knowledge, rules, signature, and workflow logic for this specific mailbox..."
						className="w-full rounded-2xl border border-neutral-200 p-3.5 text-sm font-sans leading-relaxed text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-neutral-50"
					/>
				</div>

				{/* Model & Reviewer & Quota Row */}
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div className="space-y-2">
						<Label htmlFor="agent-model" className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
							AI Model
						</Label>
						<Select
							id="agent-model"
							value={modelId}
							onChange={(e) => setModelId(e.target.value)}
							disabled={!data?.canManage || !data?.models?.length || saveMutation.isPending}
							className="h-10 text-sm"
						>
							{(data?.models ?? []).map((m) => (
								<option key={m} value={m}>
									{m}
								</option>
							))}
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="agent-reviewer" className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
							Draft Reviewer
						</Label>
						<Select
							id="agent-reviewer"
							value={reviewerUserId}
							onChange={(e) => setReviewerUserId(e.target.value)}
							disabled={!data?.canManage || saveMutation.isPending}
							className="h-10 text-sm"
						>
							{(data?.reviewers ?? []).map((r) => (
								<option key={r.id} value={r.id}>
									{r.name} ({r.email})
								</option>
							))}
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="agent-daily-limit" className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
							Daily Draft Limit (Max 100)
						</Label>
						<Input
							id="agent-daily-limit"
							type="number"
							min={1}
							max={100}
							value={dailyLimit}
							onChange={(e) => setDailyLimit(Number(e.target.value))}
							disabled={!data?.canManage || saveMutation.isPending}
							className="h-10 text-sm"
						/>
					</div>
				</div>

				{statusMessage && (
					<div
						className={`rounded-xl p-3 text-sm ${
							statusMessage.type === "success"
								? "bg-emerald-50 text-emerald-800 border border-emerald-200"
								: "bg-red-50 text-red-800 border border-red-200"
						}`}
					>
						{statusMessage.text}
					</div>
				)}

				<div className="flex items-center justify-between pt-2">
					<p className="text-xs text-neutral-400">
						Human-in-the-loop: All AI auto-drafts require reviewer approval before final transmission.
					</p>
					<Button
						type="button"
						onClick={() => saveMutation.mutate()}
						disabled={!data?.canManage || saveMutation.isPending}
						className="min-w-32 bg-blue-600 hover:bg-blue-700 text-white font-medium"
					>
						{saveMutation.isPending ? "Deploying..." : "Save & Deploy Agent"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
