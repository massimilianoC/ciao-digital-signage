import { Model, Types } from "mongoose";

export class TenantRepository<T extends { orgId: Types.ObjectId }> {
  constructor(
    protected readonly model: Model<T>,
    protected readonly orgId: Types.ObjectId,
  ) {}

  async find(filter: Record<string, unknown> = {}): Promise<T[]> {
    return this.model.find({ ...filter, orgId: this.orgId }).lean<T[]>();
  }

  async findOne(filter: Record<string, unknown>): Promise<T | null> {
    return this.model.findOne({ ...filter, orgId: this.orgId }).lean<T | null>();
  }

  async create(data: Omit<T, "orgId" | "_id">): Promise<T> {
    const doc = await this.model.create({ ...data, orgId: this.orgId } as T);
    const objectDoc = doc.toObject();
    return objectDoc as T;
  }

  async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<void> {
    await this.model.updateOne({ ...filter, orgId: this.orgId }, update);
  }

  async deleteOne(filter: Record<string, unknown>): Promise<void> {
    await this.model.deleteOne({ ...filter, orgId: this.orgId });
  }

  async countDocuments(filter: Record<string, unknown> = {}): Promise<number> {
    return this.model.countDocuments({ ...filter, orgId: this.orgId });
  }
}
