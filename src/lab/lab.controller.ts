import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LabService } from './lab.service';

@ApiTags('lab')
@Controller('lab')
export class LabController {
  constructor(private readonly labService: LabService) {}

  @Get('mail')
  @ApiOperation({
    summary: 'Listar mensagens recebidas pelo Mailpit',
    description:
      'Atalho de laboratório: o Mailpit bloqueia CORS, então o navegador não consegue ler a inbox diretamente. Esta rota faz o proxy server-side.',
  })
  async mail() {
    try {
      return await this.labService.listMessages();
    } catch (err) {
      throw new ServiceUnavailableException(
        `Mailpit indisponível em ${this.labService.baseUrl}: ${(err as Error).message}`,
      );
    }
  }
}