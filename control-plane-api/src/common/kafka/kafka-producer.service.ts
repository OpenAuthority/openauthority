import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

export interface PolicyUpdateEvent {
  eventId: string;
  eventType: 'policy.update';
  tenantId: string;
  policyId: string;
  policyName: string;
  version: number;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly topic: string;

  constructor(
    @Inject('KAFKA_PRODUCER') private readonly producer: any,
    private readonly configService: ConfigService,
  ) {
    this.topic = configService.get('KAFKA_TOPIC') || 'policy.update';
  }

  async onModuleInit() {
    await this.producer.connect();
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async publishPolicyUpdate(event: Omit<PolicyUpdateEvent, 'eventId' | 'eventType' | 'timestamp'>) {
    const policyEvent: PolicyUpdateEvent = {
      ...event,
      eventId: uuidv4(),
      eventType: 'policy.update',
      timestamp: new Date().toISOString(),
    };

    await this.producer.send({
      topic: this.topic,
      messages: [
        {
          key: event.policyId,
          headers: {
            'event-type': 'policy.update',
            'tenant-id': event.tenantId,
          },
          value: JSON.stringify(policyEvent),
        },
      ],
    });

    return policyEvent;
  }
}
