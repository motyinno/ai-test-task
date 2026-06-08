import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { Roles } from '../../shared/authz/roles.decorator';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import { PaginatedUsersDto, UserResponseDto } from './dto/user-response.dto';

type SessionRecord = Record<string, unknown>;

@ApiTags('users')
@ApiCookieAuth('session')
@Controller('users')
@Roles('SUPER_ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * B2: GET /users — paginated SA directory.
   * SA uses system context (audited escape hatch in repository layer).
   */
  @Get()
  async listUsers(@Query() query: ListUsersQueryDto): Promise<PaginatedUsersDto> {
    return this.usersService.listUsers(query);
  }

  /**
   * B4: GET /users/:id — get a single user.
   */
  @Get(':id')
  async getUser(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.getUser(id);
  }

  /**
   * B3: POST /users — create a trainer account (SA-only).
   * Returns 201; 409 EMAIL_EXISTS on duplicate (BR-001).
   */
  @Post()
  @HttpCode(201)
  async createTrainer(
    @Body() dto: CreateTrainerDto,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as { id: string } | undefined;
    if (!principal?.id) throw new UnauthorizedException();
    return this.usersService.createTrainer(dto, principal.id);
  }

  /**
   * B4: PATCH /users/:id — edit user (email/role immutable).
   */
  @Patch(':id')
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser(id, dto);
  }

  /**
   * B5: POST /users/:id/deactivate — set status to INACTIVE.
   */
  @Post(':id/deactivate')
  @HttpCode(200)
  async deactivateUser(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.deactivateUser(id);
  }

  /**
   * B5: POST /users/:id/reactivate — set status to ACTIVE.
   * 409 USER_ANONYMIZED if anonymizedAt != null (D7 guard).
   */
  @Post(':id/reactivate')
  @HttpCode(200)
  async reactivateUser(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.reactivateUser(id);
  }

  /**
   * B6: DELETE /users/:id — GDPR anonymize + write UserDeletionLog in one tx.
   * Returns 200 with the anonymized UserResponseDto; idempotent.
   */
  @Delete(':id')
  @HttpCode(200)
  async deleteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteUserDto,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as { id: string } | undefined;
    if (!principal?.id) throw new UnauthorizedException();
    return this.usersService.deleteUser(id, {
      deletedBy: principal.id,
      reason: dto.reason,
    });
  }
}
