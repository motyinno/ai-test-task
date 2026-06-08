import { Test } from '@nestjs/testing';
import { StorageService } from '../storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [StorageService],
    }).compile();
    service = mod.get(StorageService);
  });

  it('put(file) returns a { url, thumbnailUrl } for image files', async () => {
    const file = {
      originalName: 'avatar.jpg',
      buffer: Buffer.from('fake-image-data'),
      mimeType: 'image/jpeg',
      size: 100,
    };
    const result = await service.put(file, 'profiles');

    expect(result.url).toBeDefined();
    expect(result.url).toContain('profiles');
    expect(result.thumbnailUrl).toBeDefined();
    expect(result.thumbnailUrl).toContain('thumb');
    expect(result.key).toBeDefined();
  });

  it('put(file) returns url without thumbnailUrl for non-image files', async () => {
    const file = {
      originalName: 'document.pdf',
      buffer: Buffer.from('fake-pdf'),
      mimeType: 'application/pdf',
      size: 200,
    };
    const result = await service.put(file);

    expect(result.url).toBeDefined();
    expect(result.thumbnailUrl).toBeUndefined();
  });

  it('stores file in storedFiles array', async () => {
    const file = {
      originalName: 'logo.png',
      buffer: Buffer.from('fake-logo'),
      mimeType: 'image/png',
      size: 50,
    };
    await service.put(file, 'logos');

    expect(service.storedFiles).toHaveLength(1);
    expect(service.storedFiles[0].file.originalName).toBe('logo.png');
  });
});
