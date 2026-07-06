import { AssetsService } from './assets.service';

describe('AssetsService', () => {
  it('returns asset history with assignments and documents', async () => {
    const prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'asset-1',
          name: 'MacBook Pro',
          category: 'LAPTOP',
          serialNumber: 'SN-1',
          status: 'ASSIGNED',
          condition: 'GOOD',
          assignments: [
            {
              id: 'assign-1',
              assignedAt: new Date('2026-07-01'),
              returnedAt: null,
              condition: null,
              notes: null,
              employee: { id: 'emp-1', firstName: 'Asha', lastName: 'Rao', employeeCode: 'E001' },
            },
          ],
          documents: [{ id: 'doc-1', fileKey: 'assets/asset-1/invoice.pdf', fileName: 'invoice.pdf', mimeType: 'application/pdf', createdAt: new Date('2026-07-02') }],
        }),
      },
    };
    const service = new AssetsService(prisma as any);

    await expect(service.history('tenant-1', 'asset-1')).resolves.toEqual(
      expect.objectContaining({
        asset: expect.objectContaining({ id: 'asset-1', name: 'MacBook Pro' }),
        assignments: expect.any(Array),
        documents: expect.any(Array),
      }),
    );
  });

  it('creates asset documents for an existing asset', async () => {
    const prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({ id: 'asset-1', tenantId: 'tenant-1' }),
      },
      assetDocument: {
        create: jest.fn().mockResolvedValue({ id: 'doc-1', fileKey: 'assets/asset-1/handover.pdf' }),
      },
    };
    const service = new AssetsService(prisma as any);

    await expect(
      service.addDocument('tenant-1', 'asset-1', { fileKey: 'assets/asset-1/handover.pdf', fileName: 'handover.pdf' }),
    ).resolves.toEqual({ id: 'doc-1', fileKey: 'assets/asset-1/handover.pdf' });
    expect(prisma.assetDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        assetId: 'asset-1',
        fileKey: 'assets/asset-1/handover.pdf',
        fileName: 'handover.pdf',
      }),
    });
  });
});
