import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  it('generates an employee-specific document and stores it in employee profile records', async () => {
    const tx = {
      generatedDocument: {
        create: jest.fn().mockResolvedValue({
          id: 'generated-1',
          tenantId: 'tenant-1',
          employeeId: 'emp-1',
          templateId: 'template-1',
          documentType: 'OFFER_LETTER',
          title: 'Offer Letter',
          fileKey: 'tenant-1/file.html',
          fileName: 'offer.html',
          version: 1,
          createdAt: new Date('2026-07-06T00:00:00.000Z'),
        }),
      },
      employeeDocument: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const prisma = {
      documentTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-1',
          tenantId: 'tenant-1',
          templateKey: 'offer_letter',
          name: 'Offer Letter',
          module: 'recruitment',
          documentType: 'OFFER_LETTER',
          title: 'Offer Letter - {{employee.firstName}} {{employee.lastName}}',
          subject: 'Offer',
          bodyHtml: '<p>Hello {{employee.firstName}}</p>',
          bodyText: 'Hello',
          variables: [],
          language: 'en',
          status: 'ACTIVE',
          version: 1,
          isMandatory: true,
          eSignatureRequired: true,
          versions: [],
          generatedDocuments: [],
        }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'emp-1',
          firstName: 'Asha',
          lastName: 'Shah',
          employeeCode: 'EMP-0001',
          designation: { name: 'Lead Engineer' },
          department: { name: 'Product' },
          location: { name: 'Bengaluru' },
          legalEntity: { name: 'Demo Corp India Pvt Ltd' },
          costCenter: { name: 'Product' },
          businessUnit: { name: 'Platform' },
          manager: null,
        }),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Demo Corp India', legalName: 'Demo Corp India Pvt Ltd' }),
      },
      generatedDocument: {},
      policyAcknowledgement: {},
      customForm: {},
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };
    const files = {
      upload: jest.fn().mockResolvedValue({
        id: 'file-1',
        key: 'tenant-1/file.html',
        name: 'offer.html',
        sizeBytes: 123,
      }),
      downloadUrl: jest.fn().mockResolvedValue({
        url: 'https://example.com/download',
        name: 'offer.html',
      }),
    };
    const service = new DocumentsService(prisma as any, files as any);

    await expect(
      service.generateDocument(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          email: 'hr@example.com',
          name: 'HR Admin',
          isSuperAdmin: false,
          employeeId: 'emp-admin',
          roles: ['HR Admin'],
        },
        'template-1',
        { employeeId: 'emp-1', vars: { letter: 'offer' }, title: 'Offer Letter' },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'generated-1',
        downloadUrl: 'https://example.com/download',
      }),
    );

    expect(files.upload).toHaveBeenCalled();
    expect(tx.employeeDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'emp-1',
          type: 'OFFER_LETTER',
          fileKey: 'tenant-1/file.html',
        }),
      }),
    );
    expect(tx.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          employeeId: 'emp-1',
          templateId: 'template-1',
        }),
      }),
    );
  });

  it('records a policy acknowledgement for the selected employee', async () => {
    const prisma = {
      documentTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-2',
          tenantId: 'tenant-1',
          templateKey: 'policy_acknowledgement',
          name: 'Code of Conduct',
          module: 'compliance',
          documentType: 'POLICY_ACKNOWLEDGEMENT',
          title: 'Policy Acknowledgement',
          subject: 'Please acknowledge',
          bodyHtml: '<p>Acknowledge {{vars.policyName}}</p>',
          bodyText: 'Acknowledge',
          variables: [],
          language: 'en',
          status: 'ACTIVE',
          version: 1,
          isMandatory: true,
          eSignatureRequired: false,
          versions: [],
          generatedDocuments: [],
        }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'emp-1',
          firstName: 'Asha',
          lastName: 'Shah',
          employeeCode: 'EMP-0001',
        }),
      },
      policyAcknowledgement: {
        create: jest.fn().mockResolvedValue({
          id: 'ack-1',
          tenantId: 'tenant-1',
          employeeId: 'emp-1',
          templateId: 'template-2',
          policyKey: 'policy_acknowledgement',
          policyName: 'Code of Conduct',
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      generatedDocument: {},
      customForm: {},
      tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Demo Corp India', legalName: 'Demo Corp India Pvt Ltd' }) },
      $transaction: jest.fn(),
    };
    const files = {
      upload: jest.fn().mockResolvedValue({ key: 'tenant-1/policy.html', name: 'policy.html' }),
      downloadUrl: jest.fn().mockResolvedValue({ url: 'https://example.com/policy', name: 'policy.html' }),
    };
    const service = new DocumentsService(prisma as any, files as any);
    jest.spyOn(service, 'generateDocument').mockResolvedValue({
      fileKey: 'tenant-1/policy.html',
      title: 'Policy Acknowledgement',
      downloadUrl: 'https://example.com/policy',
    } as any);

    await expect(
      service.acknowledgePolicy(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          email: 'employee@example.com',
          name: 'Asha',
          isSuperAdmin: false,
          employeeId: 'emp-1',
          roles: ['Employee'],
        },
        'template-2',
        { comments: 'Acknowledged' },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'ack-1',
        document: expect.objectContaining({ fileKey: 'tenant-1/policy.html' }),
      }),
    );

    expect(prisma.policyAcknowledgement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'emp-1',
          templateId: 'template-2',
          comments: 'Acknowledged',
        }),
      }),
    );
  });
});
