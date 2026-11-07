import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domains, mailboxAgentSettings, mailboxes, users } from "@/db/schema";
import { getEnv } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getAgentProviderPublicConfig } from "@/lib/agent/provider";
import { isPrimaryAdmin } from "@/lib/auth/admin";

export async function GET(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

	const db = getDb(env);
	const isAdmin = isPrimaryAdmin(user);

	// Fetch mailboxes (admin sees all, regular user sees their own)
	const mailboxRows = await db
		.select({
			id: mailboxes.id,
			userId: mailboxes.userId,
			domainId: mailboxes.domainId,
			localPart: mailboxes.localPart,
			displayName: mailboxes.displayName,
			type: mailboxes.type,
			hostname: domains.hostname,
			ownerName: users.name,
			ownerEmail: users.email,
		})
		.from(mailboxes)
		.leftJoin(domains, eq(mailboxes.domainId, domains.id))
		.leftJoin(users, eq(mailboxes.userId, users.id));

	const filteredMailboxes = isAdmin ? mailboxRows : mailboxRows.filter((m) => m.userId === user.id);

	// Fetch all agent settings
	const agentSettingsRows = await db.select().from(mailboxAgentSettings);
	const settingsMap = new Map(agentSettingsRows.map((s) => [s.mailboxId, s]));

	const agentProvider = await getAgentProviderPublicConfig(env);

	const enrichedMailboxes = filteredMailboxes.map((m) => {
		const s = settingsMap.get(m.id);
		return {
			...m,
			address: `${m.localPart}@${m.hostname ?? "rjbusinesssolutions.org"}`,
			agent: s
				? {
						enabled: Boolean(s.enabled),
						autoDraftEnabled: Boolean(s.autoDraftEnabled),
						modelId: s.modelId ?? agentProvider.models[0] ?? null,
						dailyLimit: s.dailyLimit,
						reviewerUserId: s.reviewerUserId,
						instructions: s.instructions,
						hasInstructions: Boolean(s.instructions && s.instructions.trim().length > 0),
						instructionsPreview: s.instructions ? s.instructions.slice(0, 120) : "",
						updatedAt: s.updatedAt,
				  }
				: {
						enabled: false,
						autoDraftEnabled: false,
						modelId: agentProvider.models[0] ?? null,
						dailyLimit: 25,
						reviewerUserId: m.userId,
						instructions: "",
						hasInstructions: false,
						instructionsPreview: "",
						updatedAt: null,
				  },
		};
	});

	const totalMailboxes = enrichedMailboxes.length;
	const activeAgents = enrichedMailboxes.filter((m) => m.agent.enabled && m.agent.hasInstructions).length;
	const autoDraftEnabledCount = enrichedMailboxes.filter((m) => m.agent.autoDraftEnabled).length;

	return Response.json({
		mailboxes: enrichedMailboxes,
		models: agentProvider.models,
		providerConfigured: agentProvider.configured,
		canManage: isAdmin,
		summary: {
			totalMailboxes,
			activeAgents,
			autoDraftEnabledCount,
		},
	});
}
