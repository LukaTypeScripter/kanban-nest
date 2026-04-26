import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

type TokenResponse = { accessToken: string };
type BoardResponse = { id: number; title: string; columns: unknown[] };
type ColumnResponse = { id: number; title: string };
type CardResponse = { id: number; title: string };
type ListResponse<T> = T[];

describe('Kanban (e2e)', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let accessToken: string;

  const creds = {
    email: 'kanban@example.com',
    password: 'correct-horse-battery-staple',
    name: 'Kanban User',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: ['health', 'health/(.*)', 'docs', 'docs/(.*)'],
    });
    await app.init();

    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }, 60_000);

  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE kanban_card, kanban_column, kanban_board, refresh_tokens, users RESTART IDENTITY CASCADE',
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(creds);
    await pool.query(
      'UPDATE users SET email_verified = true WHERE email = $1',
      [creds.email],
    );
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password });
    accessToken = (login.body as TokenResponse).accessToken;
  });

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  async function createBoard(title = 'Test Board'): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/kanban/boards')
      .set(auth())
      .send({ title, description: 'hello', color: 'amber' });
    return (res.body as BoardResponse).id;
  }

  async function createColumn(
    boardId: number,
    title = 'Test Column',
  ): Promise<number> {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/kanban/boards/${boardId}/columns`)
      .set(auth())
      .send({ title, position: 0 });
    return (res.body as ColumnResponse).id;
  }

  async function createCard(
    boardId: number,
    columnId: number,
    title = 'Test Card',
  ): Promise<number> {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/kanban/boards/${boardId}/columns/${columnId}/cards`)
      .set(auth())
      .send({ title, description: 'hello', position: 0 });
    return (res.body as CardResponse).id;
  }

  describe('boards', () => {
    describe('GET /api/v1/kanban/boards', () => {
      it('returns 401 without a token', async () => {
        const res = await request(app.getHttpServer()).get(
          '/api/v1/kanban/boards',
        );
        expect(res.status).toBe(401);
      });

      it('returns 200 with an empty array when no boards exist', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/kanban/boards')
          .set(auth());
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      });

      it('returns 200 with the boards belonging to the user', async () => {
        await createBoard('My Board');
        const res = await request(app.getHttpServer())
          .get('/api/v1/kanban/boards')
          .set(auth());
        expect(res.status).toBe(200);
        const boards = res.body as ListResponse<BoardResponse>;
        expect(boards).toHaveLength(1);
        expect(boards[0].title).toBe('My Board');
      });
    });

    describe('POST /api/v1/kanban/boards', () => {
      it('returns 201 with the created board', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/kanban/boards')
          .set(auth())
          .send({ title: 'New Board', description: 'hello', color: 'blue' });
        expect(res.status).toBe(201);
        const board = res.body as BoardResponse;
        expect(board.title).toBe('New Board');
        expect(board.id).toBeDefined();
      });

      it('returns 400 on invalid body', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/kanban/boards')
          .set(auth())
          .send({ title: '' });
        expect(res.status).toBe(400);
      });
    });

    describe('GET /api/v1/kanban/boards/:boardId', () => {
      it('returns 200 with the board and its columns', async () => {
        const boardId = await createBoard();
        const res = await request(app.getHttpServer())
          .get(`/api/v1/kanban/boards/${boardId}`)
          .set(auth());
        expect(res.status).toBe(200);
        const board = res.body as BoardResponse;
        expect(board.id).toBe(boardId);
        expect(board.columns).toEqual([]);
      });

      it('returns 403 for a board that does not exist', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/kanban/boards/99999')
          .set(auth());
        expect(res.status).toBe(403);
      });
    });

    describe('PATCH /api/v1/kanban/board/:boardId', () => {
      it('returns 200 with the updated board', async () => {
        const boardId = await createBoard();
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/kanban/board/${boardId}`)
          .set(auth())
          .send({ title: 'Updated Board' });
        expect(res.status).toBe(200);
        expect((res.body as BoardResponse).title).toBe('Updated Board');
      });

      it('returns 403 for a board that does not exist', async () => {
        const res = await request(app.getHttpServer())
          .patch('/api/v1/kanban/board/99999')
          .set(auth())
          .send({ title: 'x' });
        expect(res.status).toBe(403);
      });
    });

    describe('DELETE /api/v1/kanban/board/:boardId', () => {
      it('returns 204 on successful deletion', async () => {
        const boardId = await createBoard();
        const res = await request(app.getHttpServer())
          .delete(`/api/v1/kanban/board/${boardId}`)
          .set(auth());
        expect(res.status).toBe(204);
      });

      it('returns 403 for a board that does not exist', async () => {
        const res = await request(app.getHttpServer())
          .delete('/api/v1/kanban/board/99999')
          .set(auth());
        expect(res.status).toBe(403);
      });
    });
  });

  describe('columns', () => {
    let boardId: number;

    beforeEach(async () => {
      boardId = await createBoard();
    });

    describe('GET /api/v1/kanban/boards/:boardId/columns', () => {
      it('returns 200 with the columns of the board', async () => {
        await createColumn(boardId, 'Todo');
        const res = await request(app.getHttpServer())
          .get(`/api/v1/kanban/boards/${boardId}/columns`)
          .set(auth());
        expect(res.status).toBe(200);
        const columns = res.body as ListResponse<ColumnResponse>;
        expect(columns).toHaveLength(1);
        expect(columns[0].title).toBe('Todo');
      });
    });

    describe('POST /api/v1/kanban/boards/:boardId/columns', () => {
      it('returns 201 with the created column', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/kanban/boards/${boardId}/columns`)
          .set(auth())
          .send({ title: 'Todo', position: 0 });
        expect(res.status).toBe(201);
        const column = res.body as ColumnResponse;
        expect(column.title).toBe('Todo');
        expect(column.id).toBeDefined();
      });

      it('returns 400 on invalid body', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/kanban/boards/${boardId}/columns`)
          .set(auth())
          .send({ title: '' });
        expect(res.status).toBe(400);
      });
    });

    describe('PATCH /api/v1/kanban/boards/:boardId/columns/:columnId', () => {
      it('returns 200 with the updated column', async () => {
        const columnId = await createColumn(boardId);
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/kanban/boards/${boardId}/columns/${columnId}`)
          .set(auth())
          .send({ title: 'Updated Column' });
        expect(res.status).toBe(200);
        expect((res.body as ColumnResponse).title).toBe('Updated Column');
      });

      it('returns 403 for a column that does not exist', async () => {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/kanban/boards/${boardId}/columns/99999`)
          .set(auth())
          .send({ title: 'x' });
        expect(res.status).toBe(403);
      });
    });

    describe('DELETE /api/v1/kanban/boards/:boardId/columns/:columnId', () => {
      it('returns 204 on successful deletion', async () => {
        const columnId = await createColumn(boardId);
        const res = await request(app.getHttpServer())
          .delete(`/api/v1/kanban/boards/${boardId}/columns/${columnId}`)
          .set(auth());
        expect(res.status).toBe(204);
      });

      it('returns 403 for a column that does not exist', async () => {
        const res = await request(app.getHttpServer())
          .delete(`/api/v1/kanban/boards/${boardId}/columns/99999`)
          .set(auth());
        expect(res.status).toBe(403);
      });
    });
  });

  describe('cards', () => {
    let boardId: number;
    let columnId: number;

    beforeEach(async () => {
      boardId = await createBoard();
      columnId = await createColumn(boardId);
    });

    describe('POST /api/v1/kanban/boards/:boardId/columns/:columnId/cards', () => {
      it('returns 201 with the created card', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/kanban/boards/${boardId}/columns/${columnId}/cards`)
          .set(auth())
          .send({ title: 'New Card', description: 'hello', position: 0 });
        expect(res.status).toBe(201);
        const card = res.body as CardResponse;
        expect(card.title).toBe('New Card');
        expect(card.id).toBeDefined();
      });

      it('returns 400 on invalid body', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/kanban/boards/${boardId}/columns/${columnId}/cards`)
          .set(auth())
          .send({ title: '' });
        expect(res.status).toBe(400);
      });
    });

    describe('PATCH /api/v1/kanban/boards/:boardId/columns/:columnId/cards/:cardId', () => {
      it('returns 200 with the updated card', async () => {
        const cardId = await createCard(boardId, columnId);
        const res = await request(app.getHttpServer())
          .patch(
            `/api/v1/kanban/boards/${boardId}/columns/${columnId}/cards/${cardId}`,
          )
          .set(auth())
          .send({ title: 'Updated Card' });
        expect(res.status).toBe(200);
        expect((res.body as CardResponse).title).toBe('Updated Card');
      });

      it('returns 403 for a card that does not exist', async () => {
        const res = await request(app.getHttpServer())
          .patch(
            `/api/v1/kanban/boards/${boardId}/columns/${columnId}/cards/99999`,
          )
          .set(auth())
          .send({ title: 'x' });
        expect(res.status).toBe(403);
      });
    });

    describe('DELETE /api/v1/kanban/boards/:boardId/columns/:columnId/cards/:cardId', () => {
      it('returns 204 on successful deletion', async () => {
        const cardId = await createCard(boardId, columnId);
        const res = await request(app.getHttpServer())
          .delete(
            `/api/v1/kanban/boards/${boardId}/columns/${columnId}/cards/${cardId}`,
          )
          .set(auth());
        expect(res.status).toBe(204);
      });

      it('returns 403 for a card that does not exist', async () => {
        const res = await request(app.getHttpServer())
          .delete(
            `/api/v1/kanban/boards/${boardId}/columns/${columnId}/cards/99999`,
          )
          .set(auth());
        expect(res.status).toBe(403);
      });
    });
  });
});
