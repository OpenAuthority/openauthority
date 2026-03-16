import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KafkaProducerService } from './kafka-producer.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'KAFKA_PRODUCER',
      useFactory: (configService: ConfigService) => {
        const { Kafka } = require('kafkajs');
        const kafka = new Kafka({
          clientId: 'control-plane-api',
          brokers: configService.get('KAFKA_BROKERS')?.split(',') || ['localhost:9092'],
        });
        return kafka.producer();
      },
      inject: [ConfigService],
    },
    KafkaProducerService,
  ],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
