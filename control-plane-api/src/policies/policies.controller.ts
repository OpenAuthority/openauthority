import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PoliciesService } from './policies.service';
import {
  CreatePolicyDto,
  UpdatePolicyDto,
  PromotePolicyDto,
  PolicyResponseDto,
  PolicyVersionResponseDto,
  PolicyListResponseDto,
} from './dto/policy.dto';
import { PolicyStatus } from '../common/entities';

@Controller('tenants/:tenantId/policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get()
  findAll(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('status') status?: PolicyStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PolicyListResponseDto> {
    return this.policiesService.findAll(tenantId, status, page, limit);
  }

  @Get(':id')
  findOne(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PolicyResponseDto> {
    return this.policiesService.findOne(tenantId, id);
  }

  @Post()
  create(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreatePolicyDto,
  ): Promise<PolicyResponseDto> {
    return this.policiesService.create(tenantId, dto);
  }

  @Put(':id')
  update(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePolicyDto,
  ): Promise<PolicyResponseDto> {
    return this.policiesService.update(tenantId, id, dto);
  }

  @Post(':id/promote')
  promote(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PromotePolicyDto,
  ): Promise<PolicyResponseDto> {
    return this.policiesService.promote(tenantId, id, dto);
  }

  @Post(':id/demote')
  demote(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PromotePolicyDto,
  ): Promise<PolicyResponseDto> {
    return this.policiesService.demote(tenantId, id, dto);
  }

  @Get(':id/versions')
  getVersions(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PolicyVersionResponseDto[]> {
    return this.policiesService.getVersions(tenantId, id);
  }

  @Get(':id/versions/:version')
  getVersion(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseUUIDPipe) version: number,
  ): Promise<PolicyVersionResponseDto> {
    return this.policiesService.getVersion(tenantId, id, version);
  }
}
