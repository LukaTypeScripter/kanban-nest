import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { GlobalExceptionFilter } from './http-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    const response = { status: statusMock } as unknown as Response;

    host = {
      switchToHttp: () => ({
        getResponse: <T>() => response as T,
      }),
    } as unknown as ArgumentsHost;
  });

  it('maps an HttpException to its status + response body', () => {
    const err = new BadRequestException('Bad stuff');

    filter.catch(err, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: err.getResponse(),
      }),
    );
  });

  it('falls back to 500 with generic message for unknown exceptions', () => {
    filter.catch(new Error('boom'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      }),
    );
  });

  it('includes a timestamp in every response', () => {
    filter.catch(new Error('x'), host);

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        ) as unknown as string,
      }),
    );
  });
});
