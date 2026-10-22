import { redisConnectionFromUrl } from './queue.module';

describe('redisConnectionFromUrl', () => {
  it('parses host, port and db', () => {
    expect(redisConnectionFromUrl('redis://cache.internal:6380/2')).toMatchObject({
      host: 'cache.internal',
      port: 6380,
      db: 2,
      password: undefined,
    });
  });

  it('defaults port/db and decodes credentials', () => {
    const c = redisConnectionFromUrl('redis://user:p%40ss@localhost');
    expect(c).toMatchObject({ host: 'localhost', port: 6379, db: 0, username: 'user', password: 'p@ss' });
  });

  it('enables TLS for rediss://', () => {
    expect(redisConnectionFromUrl('rediss://h:6379').tls).toEqual({});
  });
});
