"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Mail, Plus, Settings2, Sparkles, X } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth/client";
import { AGENT_PRESETS, detectPresetFromPrompt } from "@/lib/agent/presets";

interface MailboxSwarmItem {
	id: string;
	userId: string;
	localPart: string;
	displayName: string | null;
	hostname: string | null;
	address: string;
	type: "personal" | "shared";
	ownerName: string | null;
	ownerEmail: string | null;
	agent: {
		enabled: boolean;
		autoDraftEnabled: boolean;
		modelId: string | null;
		dailyLimit: number;
		reviewerUserId: string | null;
		instructions: string;
		hasInstructions: boolean;
		instructionsPreview: string;
		updatedAt: string | null;
	};
}

interface SwarmResponse {
	mailboxes: MailboxSwarmItem[];
	models: string[];
	providerConfigured: boolean;
	canManage: boolean;
	summary: {
		totalMailboxes: number;
		activeAgents: number;
		autoDraftEnabledCount: number;
	};
}

export default function AgentSwarmDashboard() {
	const qc = useQueryClient();
	const [editingMailbox, setEditingMailbox] = useState<MailboxSwarmItem | null>(null);
	const [modalInstructions, setModalInstructions] = useState("");
	const [modalAutoDraft, setModalAutoDraft] = useState(false);
	const [modalModelId, setModalModelId] = useState("");
	const [modalDailyLimit, setModalDailyLimit] = useState(25);
	const [modalPresetId, setModalPresetId] = useState<string | null>(null);
	const [modalStatus, setModalStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

	const swarmQuery = useQuery({
		queryKey: ["agent-swarm"],
		queryFn: async () => {
			const res = await authFetch("/api/agent/swarm");
			if (!res.ok) throw new Error("Failed to load agent swarm data");
			return (await res.json()) as SwarmResponse;
		},
	});

	const openEditor = (mailbox: MailboxSwarmItem) => {
		setEditingMailbox(mailbox);
		setModalInstructions(mailbox.agent.instructions || "");
		setModalAutoDraft(mailbox.agent.autoDraftEnabled);
		setModalModelId(mailbox.agent.modelId || swarmQuery.data?.models[0] || "");
		setModalDailyLimit(mailbox.agent.dailyLimit || 25);
		const detected = detectPresetFromPrompt(mailbox.agent.instructions || "");
		setModalPresetId(detected?.id || null);
		setModalStatus(null);
	};

	const saveModalMutation = useMutation({
		mutationFn: async () => {
			if (!editingMailbox) return;
			setModalStatus(null);
			const res = await authFetch("/api/agent/settings", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mailboxId: editingMailbox.id,
					enabled: true,
					modelId: modalModelId || null,
					autoDraftEnabled: modalAutoDraft,
					reviewerUserId: editingMailbox.agent.reviewerUserId || editingMailbox.userId,
					instructions: modalInstructions,
					dailyLimit: Number(modalDailyLimit) || 25,
				}),
			});
			const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok) throw new Error(json.error ?? "Failed to save agent settings");
			return json;
		},
		onSuccess: () => {
			setModalStatus({ type: "success", text: "Agent updated and deployed to mailbox!" });
			qc.invalidateQueries({ queryKey: ["agent-swarm"] });
			qc.invalidateQueries({ queryKey: ["mailboxes"] });
			if (editingMailbox) {
				qc.invalidateQueries({ queryKey: ["mailbox-agent-settings", editingMailbox.id] });
			}
			setTimeout(() => {
				setEditingMailbox(null);
			}, 900);
		},
		onError: (err) => {
			setModalStatus({ type: "error", text: err instanceof Error ? err.message : "Failed to update agent" });
		},
	});

	const applyModalPreset = (presetId: string) => {
		const preset = AGENT_PRESETS.find((p) => p.id === presetId);
		if (!preset) return;
		setModalInstructions(preset.prompt);
		setModalPresetId(preset.id);
		setModalStatus({ type: "success", text: `Applied "${preset.name}". Click Deploy to activate.` });
	};

	if (swarmQuery.isLoading) {
		return <Skeleton className="h-64 w-full rounded-3xl" />;
	}

	const data = swarmQuery.data;
	const mailboxes = data?.mailboxes ?? [];
	const summary = data?.summary ?? { totalMailboxes: 0, activeAgents: 0, autoDraftEnabledCount: 0 };

	return (
		<div className="space-y-6">
			{/* Metric KPI Cards */}
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
					<p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Total Mailboxes</p>
					<p className="mt-2 text-2xl font-bold text-neutral-900">{summary.totalMailboxes}</p>
					<p className="mt-1 text-xs text-neutral-500">Across verified domains</p>
				</div>
				<div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 shadow-sm">
					<p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Active Agents</p>
					<p className="mt-2 text-2xl font-bold text-blue-700">{summary.activeAgents}</p>
					<p className="mt-1 text-xs text-blue-600/80">Custom prompts assigned</p>
				</div>
				<div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
					<p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Auto-Drafting Inboxes</p>
					<p className="mt-2 text-2xl font-bold text-emerald-700">{summary.autoDraftEnabledCount}</p>
					<p className="mt-1 text-xs text-emerald-600/80">Background draft generation</p>
				</div>
				<div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
					<p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Primary Model</p>
					<p className="mt-2 truncate text-base font-bold text-neutral-800" title={data?.models[0] ?? "Not configured"}>
						{data?.models[0] ? data.models[0].split("/").pop() : "None"}
					</p>
					<p className="mt-1 text-xs text-neutral-500">Cloudflare Workers AI</p>
				</div>
			</div>

			{/* Agent Swarm Table */}
			<Card className="rounded-3xl border-0 bg-white p-6 shadow-sm">
				<CardHeader className="py-0">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div>
							<CardTitle className="flex items-center gap-2.5 text-lg font-semibold text-neutral-900">
								<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
									<Bot className="h-5 w-5" />
								</span>
								Mailbox Agent Swarm
							</CardTitle>
							<CardDescription className="mt-1 text-sm text-neutral-500">
								Manage and deploy custom autonomous AI agents to each specific mailbox across your organization.
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<Badge variant="outline" className="text-neutral-600">
								{summary.activeAgents} / {summary.totalMailboxes} Automated
							</Badge>
						</div>
					</div>
				</CardHeader>

				<CardContent className="pt-6">
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm text-neutral-700">
							<thead className="border-b border-neutral-100 text-xs font-semibold uppercase tracking-wider text-neutral-400">
								<tr>
									<th className="pb-3 pl-2">Mailbox Address</th>
									<th className="pb-3">Assigned Persona / Role</th>
									<th className="pb-3">Auto-Draft</th>
									<th className="pb-3">Model</th>
									<th className="pb-3">Quota</th>
									<th className="pb-3 pr-2 text-right">Action</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-neutral-100">
								{mailboxes.map((item) => {
									const detected = detectPresetFromPrompt(item.agent.instructions || "");
									const roleName = detected ? detected.name : item.agent.hasInstructions ? "Custom Persona" : "Unassigned";

									return (
										<tr key={item.id} className="group hover:bg-neutral-50/70 transition-colors">
											<td className="py-3.5 pl-2">
												<div className="flex items-center gap-2.5">
													<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold text-blue-700">
														{item.localPart.charAt(0).toUpperCase()}
													</span>
													<div className="min-w-0">
														<p className="font-semibold text-neutral-900 truncate">
															{item.displayName || item.localPart}
														</p>
														<p className="font-mono text-xs text-neutral-500 truncate">
															{item.address}
														</p>
													</div>
												</div>
											</td>
											<td className="py-3.5">
												{item.agent.hasInstructions ? (
													<span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 border border-blue-200">
														<Sparkles className="h-3 w-3 text-blue-600" />
														{roleName}
													</span>
												) : (
													<span className="text-xs text-neutral-400">No agent prompt</span>
												)}
											</td>
											<td className="py-3.5">
												{item.agent.autoDraftEnabled ? (
													<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
														<span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
														Active
													</span>
												) : (
													<span className="text-xs text-neutral-400">Disabled</span>
												)}
											</td>
											<td className="py-3.5 font-mono text-xs text-neutral-600">
												{item.agent.modelId ? item.agent.modelId.split("/").pop() : "default"}
											</td>
											<td className="py-3.5 text-xs text-neutral-500">
												{item.agent.dailyLimit}/day
											</td>
											<td className="py-3.5 pr-2 text-right">
												<div className="flex items-center justify-end gap-2">
													<Button
														type="button"
														size="sm"
														variant="outline"
														onClick={() => openEditor(item)}
														className="h-8 text-xs font-medium rounded-xl border-neutral-200 hover:border-blue-400 hover:text-blue-700"
													>
														<Bot className="h-3.5 w-3.5 mr-1 text-blue-600" />
														{item.agent.hasInstructions ? "Edit Agent" : "Deploy Agent"}
													</Button>
													<Link
														href={`/mailboxes/${item.id}`}
														className="text-neutral-400 hover:text-neutral-700 p-1"
														title="Open Mailbox Settings"
													>
														<Settings2 className="h-4 w-4" />
													</Link>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>

			{/* Edit/Deploy Modal */}
			<Dialog open={!!editingMailbox} onOpenChange={(open) => !open && setEditingMailbox(null)}>
				<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-lg">
							<Bot className="h-5 w-5 text-blue-600" />
							Configure AI Agent for {editingMailbox?.address}
						</DialogTitle>
						<DialogDescription>
							Customize the system persona, automatic drafting rules, and AI model for this specific mailbox.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-5 pt-3">
						{/* Auto-Draft Toggle */}
						<div className="flex items-center justify-between gap-4 rounded-xl bg-neutral-50 p-3.5 border border-neutral-100">
							<div>
								<p className="text-sm font-semibold text-neutral-900">Auto-Draft Incoming Emails</p>
								<p className="text-xs text-neutral-500">Draft replies in background when customer emails arrive</p>
							</div>
							<Switch
								checked={modalAutoDraft}
								onCheckedChange={(c) => setModalAutoDraft(c)}
								disabled={saveModalMutation.isPending}
							/>
						</div>

						{/* Quick Templates */}
						<div className="space-y-2">
							<Label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
								1-Click Agent Persona Templates
							</Label>
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
								{AGENT_PRESETS.map((p) => (
									<button
										key={p.id}
										type="button"
										onClick={() => applyModalPreset(p.id)}
										className={`p-2.5 rounded-xl border text-left text-xs transition-colors ${
											modalPresetId === p.id
												? "border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-500"
												: "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800"
										}`}
									>
										<span className="font-semibold block truncate">{p.name}</span>
										<span className="text-[10px] text-neutral-500 block truncate">{p.shortRole}</span>
									</button>
								))}
							</div>
						</div>

						{/* System Prompt */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label htmlFor="modal-instructions" className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
									Custom Agent Instructions (Prompt)
								</Label>
								<span className="text-[11px] font-mono text-neutral-400">
									{modalInstructions.length} / 4,000 chars
								</span>
							</div>
							<textarea
								id="modal-instructions"
								rows={6}
								value={modalInstructions}
								onChange={(e) => {
									setModalInstructions(e.target.value);
									setModalPresetId(null);
								}}
								placeholder="Enter custom instructions for how this agent should handle emails in this mailbox..."
								className="w-full rounded-xl border border-neutral-200 p-3 text-sm focus:border-blue-500 focus:outline-none"
							/>
						</div>

						{/* Model & Limit */}
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-1.5">
								<Label htmlFor="modal-model" className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
									Model
								</Label>
								<Select
									id="modal-model"
									value={modalModelId}
									onChange={(e) => setModalModelId(e.target.value)}
									className="h-10 text-xs"
								>
									{(data?.models ?? []).map((m) => (
										<option key={m} value={m}>
											{m}
										</option>
									))}
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="modal-quota" className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
									Daily Draft Limit
								</Label>
								<Input
									id="modal-quota"
									type="number"
									min={1}
									max={100}
									value={modalDailyLimit}
									onChange={(e) => setModalDailyLimit(Number(e.target.value))}
									className="h-10 text-xs"
								/>
							</div>
						</div>

						{modalStatus && (
							<div
								className={`rounded-xl p-3 text-xs ${
									modalStatus.type === "success"
										? "bg-emerald-50 text-emerald-800 border border-emerald-200"
										: "bg-red-50 text-red-800 border border-red-200"
								}`}
							>
								{modalStatus.text}
							</div>
						)}

						<div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
							<Button
								type="button"
								variant="ghost"
								onClick={() => setEditingMailbox(null)}
								disabled={saveModalMutation.isPending}
							>
								Cancel
							</Button>
							<Button
								type="button"
								onClick={() => saveModalMutation.mutate()}
								disabled={saveModalMutation.isPending}
								className="bg-blue-600 hover:bg-blue-700 text-white"
							>
								{saveModalMutation.isPending ? "Deploying..." : "Save & Deploy"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
