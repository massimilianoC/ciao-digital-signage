import { auth } from "@/lib/auth/auth";
import { connectDB } from "@/lib/db/connection";
import { OrgMeta } from "@/lib/models/org-meta.model";

type OrganizationDTO = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  quota: {
    maxScreens: number;
    maxStorageBytes: number;
  };
  createdAt: Date;
};

type AuthOrg = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
};

export class OrgService {
  static async listAll(adminHeaders: Headers): Promise<OrganizationDTO[]> {
    await connectDB();

    const organizationResponse = await auth.api.listOrganizations({
      headers: adminHeaders,
    });

    const authOrganizations = (organizationResponse ?? []) as AuthOrg[];
    const orgMetas = await OrgMeta.find({
      betterAuthOrgId: { $in: authOrganizations.map((organization) => organization.id) },
    }).lean();

    const metaByOrgId = new Map(
      orgMetas.map((meta) => [meta.betterAuthOrgId, meta]),
    );

    return authOrganizations.map((organization) => {
      const meta = metaByOrgId.get(organization.id);

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: meta?.status ?? "active",
        quota: {
          maxScreens: meta?.quota.maxScreens ?? 10,
          maxStorageBytes: meta?.quota.maxStorageBytes ?? 1_073_741_824,
        },
        createdAt: organization.createdAt,
      };
    });
  }

  static async create(
    params: { name: string; slug: string },
    adminHeaders: Headers,
  ): Promise<{ betterAuthOrgId: string }> {
    await connectDB();

    const organization = await auth.api.createOrganization({
      body: {
        name: params.name,
        slug: params.slug,
      },
      headers: adminHeaders,
    });

    if (!organization?.id) {
      throw new Error("Unable to create organization");
    }

    await OrgMeta.create({
      betterAuthOrgId: organization.id,
      status: "active",
      quota: {
        maxScreens: 10,
        maxStorageBytes: 1_073_741_824,
      },
    });

    return { betterAuthOrgId: organization.id };
  }

  static async suspend(betterAuthOrgId: string): Promise<void> {
    await connectDB();

    await OrgMeta.updateOne(
      { betterAuthOrgId },
      { $set: { status: "suspended" } },
      { upsert: true },
    );
  }

  static async reactivate(betterAuthOrgId: string): Promise<void> {
    await connectDB();

    await OrgMeta.updateOne(
      { betterAuthOrgId },
      { $set: { status: "active" } },
      { upsert: true },
    );
  }

  static async delete(betterAuthOrgId: string, adminHeaders: Headers): Promise<void> {
    await connectDB();

    await OrgMeta.deleteOne({ betterAuthOrgId });
    await auth.api.deleteOrganization({
      body: { organizationId: betterAuthOrgId },
      headers: adminHeaders,
    });
  }

  static async updateQuota(
    betterAuthOrgId: string,
    quota: { maxScreens?: number; maxStorageBytes?: number },
  ): Promise<void> {
    await connectDB();

    const setPayload: Record<string, number> = {};

    if (quota.maxScreens !== undefined) {
      setPayload["quota.maxScreens"] = quota.maxScreens;
    }

    if (quota.maxStorageBytes !== undefined) {
      setPayload["quota.maxStorageBytes"] = quota.maxStorageBytes;
    }

    if (Object.keys(setPayload).length === 0) {
      return;
    }

    await OrgMeta.updateOne(
      { betterAuthOrgId },
      { $set: setPayload },
      { upsert: true },
    );
  }
}
