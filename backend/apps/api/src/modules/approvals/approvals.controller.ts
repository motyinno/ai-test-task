import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApprovalsService } from './approvals.service';
import { ListApprovalsQueryDto } from './dto/list-approvals-query.dto';
import { ResolveApprovalDto } from './dto/resolve-approval.dto';
import { Roles } from '../../shared/authz/roles.decorator';

type SessionRecord = Record<string, unknown>;
interface SessionPrincipal {
  id: string;
  role: string;
  isChild?: boolean;
}

/**
 * ApprovalsController — D8.
 *
 * Parent-only endpoints: PLAYER role, non-child principals.
 * GET /approvals         — paginated queue, filterable by status/childProfileId
 * GET /approvals/:id     — single request
 * POST /approvals/:id/approve — approve (409 if terminal)
 * POST /approvals/:id/deny    — deny (409 if terminal)
 */
@ApiTags('approvals')
@Controller('approvals')
@Roles('PLAYER')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  private getParentId(req: Request): string {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as SessionPrincipal | undefined;
    if (!principal?.id) {
      throw new UnauthorizedException('Not authenticated');
    }
    return principal.id;
  }

  @Get()
  @ApiOperation({ summary: 'List parent approval queue (paginated)' })
  async list(@Req() req: Request, @Query() query: ListApprovalsQueryDto) {
    const parentUserId = this.getParentId(req);
    return this.approvalsService.listByParent(parentUserId, {
      status: query.status,
      childProfileId: query.childProfileId,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one approval request' })
  async findOne(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const parentUserId = this.getParentId(req);
    return this.approvalsService.findById(id, parentUserId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending request' })
  async approve(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveApprovalDto,
  ) {
    const parentUserId = this.getParentId(req);
    return this.approvalsService.approve(id, parentUserId, dto.parentNotes);
  }

  @Post(':id/deny')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deny a pending request' })
  async deny(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveApprovalDto,
  ) {
    const parentUserId = this.getParentId(req);
    return this.approvalsService.deny(id, parentUserId, dto.parentNotes);
  }
}
